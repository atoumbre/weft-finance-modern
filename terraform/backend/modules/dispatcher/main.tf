terraform {
  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

data "archive_file" "dispatcher_zip" {
  type        = "zip"
  source_dir  = "${path.root}/../../dispatcher/dist"
  output_path = "${path.root}/dispatcher.zip"
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
      Resource = var.indexer_queue_arn
    }]
  })
}

resource "aws_lambda_function" "dispatcher" {
  filename         = data.archive_file.dispatcher_zip.output_path
  function_name    = "weft-${var.environment}-dispatcher"
  role             = aws_iam_role.dispatcher_lambda_role.arn
  handler          = "dist/index.handler"
  runtime          = "nodejs22.x"
  timeout          = var.dispatcher_timeout
  memory_size      = var.dispatcher_memory
  source_code_hash = data.archive_file.dispatcher_zip.output_base64sha256

  environment {
    variables = {
      INDEXER_QUEUE_URL  = var.indexer_queue_url
      INDEXER_BATCH_SIZE = var.indexer_batch_size
      RADIX_GATEWAY_URL  = var.radix_gateway_url
    }
  }
}

resource "aws_cloudwatch_log_group" "dispatcher" {
  name              = "/aws/lambda/${aws_lambda_function.dispatcher.function_name}"
  retention_in_days = var.log_retention_days
}

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

