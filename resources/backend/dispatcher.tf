
data "archive_file" "dispatcher_zip" {
  type        = "zip"
  output_path = "${path.module}/dummy_payload.zip"
  source {
    content  = "exports.handler = () => 'Dummy code'"
    filename = "dist/index.js"
  }
}

// 

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
  runtime          = "nodejs22.x"
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

  lifecycle {
    # CRITICAL: This stops Terraform from reverting your code 
    ignore_changes = [
      filename,
      source_code_hash,
    ]
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
