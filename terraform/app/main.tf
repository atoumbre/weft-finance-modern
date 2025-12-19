terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
}

# --- Data Sources ---
data "aws_availability_zones" "available" {}

# Look up the pre-created ECR Repositories
data "aws_ecr_repository" "indexer" {
  name = "weft-indexer"
}

data "aws_ecr_repository" "liquidator" {
  name = "weft-liquidator"
}

# --- Networking ---
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr_block
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = { Name = "weft-${var.environment}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr_block, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "ecs_sg" {
  name        = "weft-${var.environment}-ecs-sg"
  description = "Allow outbound traffic"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# --- Messaging ---
resource "aws_sqs_queue" "indexer_dlq" {
  name = "weft-${var.environment}-indexer-queue-dlq"
}

resource "aws_sqs_queue" "indexer_queue" {
  name                       = "weft-${var.environment}-indexer-queue"
  visibility_timeout_seconds = var.sqs_visibility_timeout
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.indexer_dlq.arn
    maxReceiveCount     = var.sqs_max_receive_count
  })
}

resource "aws_sqs_queue" "liquidation_dlq" {
  name = "weft-${var.environment}-liquidation-queue-dlq"
}

resource "aws_sqs_queue" "liquidation_queue" {
  name                       = "weft-${var.environment}-liquidation-queue"
  visibility_timeout_seconds = var.sqs_visibility_timeout
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.liquidation_dlq.arn
    maxReceiveCount     = var.sqs_max_receive_count
  })
}

# --- Storage ---
resource "aws_s3_bucket" "main" {
  bucket_prefix = "weft-${var.environment}-data-"
  force_destroy = true
}

# --- SSM Secrets ---
resource "aws_ssm_parameter" "liquidation_seed" {
  name        = var.ssm_parameter_name_seed_phrase
  description = "Seed phrase for liquidator"
  type        = "SecureString"
  value       = var.liquidation_seed_phrase
  lifecycle {
    ignore_changes = [value] # Allow manual updates in console without drift
  }
}

# --- ECS Cluster ---
resource "aws_ecs_cluster" "main" {
  name = "weft-${var.environment}-cluster"
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE_SPOT"
  }
}

# --- ECS Task IAM Roles ---
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
        Resource = aws_ssm_parameter.liquidation_seed.arn
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

# --- Indexer Service ---
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
    image = data.aws_ecr_repository.indexer.repository_url
    environment = [
      { name = "QUEUE_URL", value = aws_sqs_queue.indexer_queue.id },
      { name = "LIQUIDATION_QUEUE_URL", value = aws_sqs_queue.liquidation_queue.id },
      { name = "BUCKET_NAME", value = aws_s3_bucket.main.id },
      { name = "RADIX_GATEWAY_URL", value = var.radix_gateway_url }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.indexer.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "indexer"
      }
    }
  }])
}

resource "aws_cloudwatch_log_group" "indexer" {
  name              = "/ecs/weft-${var.environment}-indexer"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_service" "indexer" {
  name            = "indexer"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.indexer.arn
  desired_count   = 1 # Initial count, Auto Scaling will manage this
  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs_sg.id]
    assign_public_ip = true
  }

  # Ignore changes to desired_count as Auto Scaling will modify it
  lifecycle {
    ignore_changes = [desired_count]
  }
}

# --- Auto Scaling ---
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

# --- Liquidator Service ---
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
    image = data.aws_ecr_repository.liquidator.repository_url
    environment = [
      { name = "LIQUIDATION_QUEUE_URL", value = aws_sqs_queue.liquidation_queue.id },
      { name = "RADIX_GATEWAY_URL", value = var.radix_gateway_url },
      { name = "LENDING_MARKET_COMPONENT", value = var.lending_market_component }
    ]
    secrets = [
      {
        name      = "SEED_PHRASE"
        valueFrom = aws_ssm_parameter.liquidation_seed.arn
      }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.liquidator.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "liquidator"
      }
    }
  }])
}



resource "aws_cloudwatch_log_group" "liquidator" {
  name              = "/ecs/weft-${var.environment}-liquidator"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_service" "liquidator" {
  name            = "liquidator"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.liquidator.arn
  desired_count   = 1
  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    base              = 1
    weight            = 0
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs_sg.id]
    assign_public_ip = true
  }

  # Ignore changes to desired_count as Auto Scaling will modify it
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

# --- Dispatcher Lambda ---

# Auto-zip the dispatcher Lambda code
data "archive_file" "dispatcher_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../dispatcher/dist"
  output_path = "${path.module}/dispatcher.zip"
}

resource "aws_iam_role" "dispatcher_lambda_role" {
  name = "weft-${var.environment}-dispatcher-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}


resource "aws_iam_role_policy_attachment" "dispatcher_lambda_basic" {
  role       = aws_iam_role.dispatcher_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "dispatcher_lambda_sqs" {
  role = aws_iam_role.dispatcher_lambda_role.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:SendMessage", "sqs:GetQueueUrl"]
      Resource = aws_sqs_queue.indexer_queue.arn
    }]
  })
}

resource "aws_lambda_function" "dispatcher" {
  filename         = data.archive_file.dispatcher_zip.output_path
  function_name    = "weft-${var.environment}-dispatcher"
  role             = aws_iam_role.dispatcher_lambda_role.arn
  handler          = "dist/index.handler"
  runtime          = "nodejs20.x"
  timeout          = var.dispatcher_timeout
  memory_size      = var.dispatcher_memory
  source_code_hash = data.archive_file.dispatcher_zip.output_base64sha256

  environment {
    variables = {
      INDEXER_QUEUE_URL  = aws_sqs_queue.indexer_queue.id
      INDEXER_BATCH_SIZE = var.indexer_batch_size
      RADIX_GATEWAY_URL  = var.radix_gateway_url
    }
  }
}

resource "aws_cloudwatch_log_group" "dispatcher" {
  name              = "/aws/lambda/${aws_lambda_function.dispatcher.function_name}"
  retention_in_days = var.log_retention_days
}

# --- EventBridge Scheduler ---
resource "aws_scheduler_schedule" "dispatcher_schedule" {
  name = "weft-${var.environment}-dispatcher-schedule"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression = var.dispatcher_schedule

  target {
    arn      = aws_lambda_function.dispatcher.arn
    role_arn = aws_iam_role.dispatcher_scheduler_role.arn
  }
}

resource "aws_iam_role" "dispatcher_scheduler_role" {
  name = "weft-${var.environment}-scheduler-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "dispatcher_scheduler_lambda" {
  role = aws_iam_role.dispatcher_scheduler_role.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.dispatcher.arn
    }]
  })
}

