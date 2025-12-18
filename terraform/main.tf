terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# --- Networking ---
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
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
  cidr_block              = "10.0.${count.index}.0/24"
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

data "aws_availability_zones" "available" {}

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
resource "aws_sqs_queue" "indexer_queue" {
  name                       = "weft-${var.environment}-indexer-queue"
  visibility_timeout_seconds = 300
}

resource "aws_sqs_queue" "liquidation_queue" {
  name                       = "weft-${var.environment}-liquidation-queue"
  visibility_timeout_seconds = 300
}

# --- Storage ---
resource "aws_s3_bucket" "main" {
  bucket_prefix = "weft-${var.environment}-data-"
}

# --- ECR ---
resource "aws_ecr_repository" "indexer" {
  name = "weft-indexer"
}

resource "aws_ecr_repository" "liquidator" {
  name = "weft-liquidator"
}

# --- Lambda (Dispatcher) ---
resource "aws_iam_role" "lambda_role" {
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

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_sqs" {
  role = aws_iam_role.lambda_role.name
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
  filename         = "../dispatcher/dispatcher.zip"
  function_name    = "weft-${var.environment}-dispatcher"
  role             = aws_iam_role.lambda_role.arn
  handler          = "dist/index.handler"
  runtime          = "nodejs20.x"
  timeout          = 300
  source_code_hash = fileexists("../dispatcher/dispatcher.zip") ? filebase64sha256("../dispatcher/dispatcher.zip") : null

  environment {
    variables = {
      INDEXER_QUEUE_URL  = aws_sqs_queue.indexer_queue.id
      INDEXER_BATCH_SIZE = var.indexer_batch_size
      RADIX_GATEWAY_URL  = var.radix_gateway_url
    }
  }
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
    role_arn = aws_iam_role.scheduler_role.arn
  }
}

resource "aws_iam_role" "scheduler_role" {
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

resource "aws_iam_role_policy" "scheduler_lambda" {
  role = aws_iam_role.scheduler_role.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.dispatcher.arn
    }]
  })
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

resource "aws_iam_role" "ecs_task_role" {
  name = "weft-${var.environment}-ecs-task-role"
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
  role = aws_iam_role.ecs_task_role.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:SendMessage"]
        Resource = [aws_sqs_queue.indexer_queue.arn, aws_sqs_queue.liquidation_queue.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.main.arn}/*"
      }
    ]
  })
}

# --- Indexer Service ---
resource "aws_ecs_task_definition" "indexer" {
  family                   = "weft-indexer"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([{
    name  = "indexer"
    image = aws_ecr_repository.indexer.repository_url
    environment = [
      { name = "QUEUE_URL", value = aws_sqs_queue.indexer_queue.id },
      { name = "LIQUIDATION_QUEUE_URL", value = aws_sqs_queue.liquidation_queue.id },
      { name = "BUCKET_NAME", value = aws_s3_bucket.main.id },
      { name = "RADIX_GATEWAY_URL", value = var.radix_gateway_url }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/weft-${var.environment}-indexer"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "indexer"
        "awslogs-create-group"  = "true"
      }
    }
  }])
}

resource "aws_ecs_service" "indexer" {
  name            = "indexer"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.indexer.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs_sg.id]
    assign_public_ip = true
  }
}

# --- Liquidator Service ---
resource "aws_ecs_task_definition" "liquidator" {
  family                   = "weft-liquidator"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([{
    name  = "liquidator"
    image = aws_ecr_repository.liquidator.repository_url
    environment = [
      { name = "LIQUIDATION_QUEUE_URL", value = aws_sqs_queue.liquidation_queue.id },
      { name = "RADIX_GATEWAY_URL", value = var.radix_gateway_url },
      { name = "SEED_PHRASE", value = var.liquidation_seed_phrase }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/weft-${var.environment}-liquidator"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "liquidator"
        "awslogs-create-group"  = "true"
      }
    }
  }])
}

resource "aws_ecs_service" "liquidator" {
  name            = "liquidator"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.liquidator.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs_sg.id]
    assign_public_ip = true
  }
}
