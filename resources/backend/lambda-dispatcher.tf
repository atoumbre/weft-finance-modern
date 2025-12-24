

variable "dispatcher_schedule" {
  description = "Schedule expression for dispatcher (e.g. rate(5 minutes))"
  type        = string
}

variable "dispatcher_timeout" {
  description = "Timeout for dispatcher Lambda in seconds"
  type        = number
}

variable "dispatcher_memory" {
  description = "Memory size for dispatcher Lambda in MB"
  type        = number
}

variable "indexer_batch_size" {
  description = "Number of CDPs per batch for indexer"
  type        = number
}



module "dispatcher" {
  source = "./modules/scheduled_lambda"

  function_name      = "weft-${var.environment}-dispatcher"
  schedule           = var.dispatcher_schedule
  timeout            = var.dispatcher_timeout
  memory             = var.dispatcher_memory
  log_retention_days = var.log_retention_days
  environment_variables = {
    INDEXER_QUEUE_URL  = aws_sqs_queue.indexer_queue.id
    INDEXER_BATCH_SIZE = var.indexer_batch_size
    RADIX_GATEWAY_URL  = var.radix_gateway_url
  }
  extra_iam_policy_statements = [
    {
      effect    = "Allow"
      actions   = ["sqs:SendMessage", "sqs:GetQueueUrl"]
      resources = [aws_sqs_queue.indexer_queue.arn]
    }
  ]
}
