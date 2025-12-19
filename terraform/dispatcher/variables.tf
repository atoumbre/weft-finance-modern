variable "aws_region" {
  description = "AWS region"
}

variable "environment" {
  description = "Environment name (e.g. mainnet)"
}

variable "state_bucket" {
  description = "Bucket for remote state of the app"
}

variable "lock_table" {
  description = "DynamoDB table for remote state locking"
}

variable "dispatcher_schedule" {
  description = "Schedule expression for dispatcher"
}

variable "indexer_batch_size" {
  description = "Number of CDPs per batch"
}

variable "radix_gateway_url" {
}

variable "dispatcher_timeout" {
  type        = number
  description = "Timeout for dispatcher Lambda in seconds"
}

variable "dispatcher_memory" {
  description = "Memory size for dispatcher Lambda in MB"
}
