data "aws_ecr_repository" "indexer" {
  name = "weft-indexer"
}

data "aws_ecr_repository" "liquidator" {
  name = "weft-liquidator"
}

locals {
  indexer_image_full    = var.indexer_image_digest != "" ? "${data.aws_ecr_repository.indexer.repository_url}@${var.indexer_image_digest}" : data.aws_ecr_repository.indexer.repository_url
  liquidator_image_full = var.liquidator_image_digest != "" ? "${data.aws_ecr_repository.liquidator.repository_url}@${var.liquidator_image_digest}" : data.aws_ecr_repository.liquidator.repository_url
}

resource "aws_ecs_cluster" "main" {
  name = "weft-${var.environment}-cluster"

  tags = {
    Environment = "Production"
    ManagedBy   = "Terraform"
    Application = "Weft"
  }
}


resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE_SPOT"]
  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE_SPOT"
  }
}

resource "aws_iam_role" "ecs_execution_role" {
  name = "weft-${var.environment}-ecs-execution-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_ssm" {
  name = "weft-${var.environment}-ecs-execution-ssm-policy"
  role = aws_iam_role.ecs_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = "ssm:GetParameters"
        Effect   = "Allow"
        Resource = data.aws_ssm_parameter.liquidation_seed.arn
      }
    ]
  })
}

resource "aws_iam_role" "indexer_task_role" {
  name = "weft-${var.environment}-indexer-task-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role" "liquidator_task_role" {
  name = "weft-${var.environment}-liquidator-task-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "indexer_policy" {
  role = aws_iam_role.indexer_task_role.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.indexer_queue.arn
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage", "sqs:GetQueueUrl"]
        Resource = aws_sqs_queue.liquidation_queue.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.main.arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "liquidator_policy" {
  role = aws_iam_role.liquidator_task_role.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.liquidation_queue.arn
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "indexer" {
  name              = "/aws/ecs/weft-${var.environment}-indexer"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_task_definition" "indexer" {
  family                   = "weft-indexer"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ecs_indexer_cpu
  memory                   = var.ecs_indexer_memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.indexer_task_role.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name  = "indexer"
    image = local.indexer_image_full
    environment = [
      { name = "QUEUE_URL", value = aws_sqs_queue.indexer_queue.id },
      { name = "LIQUIDATION_QUEUE_URL", value = aws_sqs_queue.liquidation_queue.id },
      { name = "BUCKET_NAME", value = aws_s3_bucket.main.id },
      { name = "RADIX_GATEWAY_URL", value = var.radix_gateway_url }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.indexer.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "indexer"
      }
    }
  }])
}



resource "aws_ecs_service" "indexer" {
  name            = "indexer"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.indexer.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs_sg.id]
    assign_public_ip = true
  }

  lifecycle {
    ignore_changes = [desired_count]
  }
}

resource "aws_appautoscaling_target" "indexer" {
  max_capacity       = var.ecs_indexer_max_capacity
  min_capacity       = var.ecs_indexer_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.indexer.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "indexer_sqs_scaling" {
  name               = "weft-${var.environment}-indexer-sqs-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.indexer.resource_id
  scalable_dimension = aws_appautoscaling_target.indexer.scalable_dimension
  service_namespace  = aws_appautoscaling_target.indexer.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = var.ecs_indexer_scaling_target_value
    scale_in_cooldown  = var.ecs_indexer_scale_in_cooldown
    scale_out_cooldown = var.ecs_indexer_scale_out_cooldown

    customized_metric_specification {
      metric_name = "ApproximateNumberOfMessagesVisible"
      namespace   = "AWS/SQS"
      statistic   = "Average"
      unit        = "Count"
      dimensions {
        name  = "QueueName"
        value = aws_sqs_queue.indexer_queue.name
      }
    }
  }
}

resource "aws_cloudwatch_log_group" "liquidator" {
  name              = "/aws/ecs/weft-${var.environment}-liquidator"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_task_definition" "liquidator" {
  family                   = "weft-liquidator"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ecs_liquidator_cpu
  memory                   = var.ecs_liquidator_memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.liquidator_task_role.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name  = "liquidator"
    image = local.liquidator_image_full
    environment = [
      { name = "LIQUIDATION_QUEUE_URL", value = aws_sqs_queue.liquidation_queue.id },
      { name = "RADIX_GATEWAY_URL", value = var.radix_gateway_url },
    ]
    secrets = [
      {
        name      = "SEED_PHRASE"
        valueFrom = data.aws_ssm_parameter.liquidation_seed.arn
      }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.liquidator.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "liquidator"
      }
    }
  }])
}

resource "aws_ecs_service" "liquidator" {
  name            = "liquidator"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.liquidator.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs_sg.id]
    assign_public_ip = true
  }

  lifecycle {
    ignore_changes = [desired_count]
  }
}

resource "aws_appautoscaling_target" "liquidator" {
  max_capacity       = var.ecs_liquidator_max_capacity
  min_capacity       = var.ecs_liquidator_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.liquidator.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "liquidator_sqs_scaling" {
  name               = "weft-${var.environment}-liquidator-sqs-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.liquidator.resource_id
  scalable_dimension = aws_appautoscaling_target.liquidator.scalable_dimension
  service_namespace  = aws_appautoscaling_target.liquidator.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = var.ecs_liquidator_scaling_target_value
    scale_in_cooldown  = var.ecs_liquidator_scale_in_cooldown
    scale_out_cooldown = var.ecs_liquidator_scale_out_cooldown

    customized_metric_specification {
      metric_name = "ApproximateNumberOfMessagesVisible"
      namespace   = "AWS/SQS"
      statistic   = "Average"
      unit        = "Count"
      dimensions {
        name  = "QueueName"
        value = aws_sqs_queue.liquidation_queue.name
      }
    }
  }
}
