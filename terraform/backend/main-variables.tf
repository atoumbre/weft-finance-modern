variable "aws_region" {
  description = "AWS region"
}

variable "environment" {
  description = "Environment name (e.g. mainnet, stokenet)"
  type        = string
}

variable "sqs_visibility_timeout" {
  description = "Visibility timeout for SQS queues in seconds"
  type        = number
}

variable "sqs_max_receive_count" {
  description = "Max receive count before moving to DLQ"
  type        = number
}

variable "ssm_parameter_name_seed_phrase" {
  description = "The name of the SSM parameter storing the seed phrase"
  type        = string
}

variable "radix_gateway_url" {
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
}
