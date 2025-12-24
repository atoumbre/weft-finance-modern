variable "aws_region" {
  description = "AWS region"
}

variable "environment" {
  description = "Environment name (e.g. mainnet, stokenet)"
  type        = string
}

variable "radix_gateway_url" {
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
}
