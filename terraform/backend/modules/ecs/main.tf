locals {
  indexer_image_full    = var.indexer_image_digest != "" ? "${var.indexer_image}@${var.indexer_image_digest}" : var.indexer_image
  liquidator_image_full = var.liquidator_image_digest != "" ? "${var.liquidator_image}@${var.liquidator_image_digest}" : var.liquidator_image
}

resource "aws_ecs_cluster" "main" {
  name = "weft-${var.environment}-cluster"
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
        Resource = var.liquidation_seed_ssm_parameter_arn
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
        Resource = var.indexer_queue_arn
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage", "sqs:GetQueueUrl"]
        Resource = var.liquidation_queue_arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${var.bucket_arn}/*"
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
        Resource = var.liquidation_queue_arn
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "indexer" {
  name              = "/ecs/weft-${var.environment}-indexer"
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
      { name = "QUEUE_URL", value = var.indexer_queue_url },
      { name = "LIQUIDATION_QUEUE_URL", value = var.liquidation_queue_url },
      { name = "BUCKET_NAME", value = var.bucket_name },
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
    subnets          = var.public_subnet_ids
    security_groups  = [var.ecs_security_group_id]
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
        value = var.indexer_queue_name
      }
    }
  }
}

resource "aws_cloudwatch_log_group" "liquidator" {
  name              = "/ecs/weft-${var.environment}-liquidator"
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
      { name = "LIQUIDATION_QUEUE_URL", value = var.liquidation_queue_url },
      { name = "RADIX_GATEWAY_URL", value = var.radix_gateway_url },
      { name = "LENDING_MARKET_COMPONENT", value = var.lending_market_component }
    ]
    secrets = [
      {
        name      = "SEED_PHRASE"
        valueFrom = var.liquidation_seed_ssm_parameter_arn
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
    subnets          = var.public_subnet_ids
    security_groups  = [var.ecs_security_group_id]
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
        value = var.liquidation_queue_name
      }
    }
  }
}
