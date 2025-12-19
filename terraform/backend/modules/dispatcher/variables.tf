variable "environment" {
  description = "Environment name (e.g. mainnet, stokenet)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
}

variable "indexer_queue_url" {
  description = "Indexer SQS queue URL"
  type        = string
}

variable "indexer_queue_arn" {
  description = "Indexer SQS queue ARN"
  type        = string
}

variable "radix_gateway_url" {
  description = "Radix Gateway API base URL"
  type        = string
}

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

