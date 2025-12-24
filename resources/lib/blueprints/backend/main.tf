variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "environment" {
  description = "Environment name (e.g. mainnet, stokenet)"
  type        = string
}

variable "radix_gateway_url" {
  description = "Radix gateway URL"
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
}

variable "log_level" {
  description = "Log level for all services (debug, info, warn, error)"
  type        = string
  default     = "info"
}
