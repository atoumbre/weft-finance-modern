variable "environment" {
  description = "Environment name (e.g. mainnet, stokenet)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "public_subnet_ids" {
  description = "Subnet IDs for ECS tasks"
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "Security group ID for ECS tasks"
  type        = string
}

variable "indexer_queue_url" {
  description = "Indexer SQS queue URL"
  type        = string
}

variable "indexer_queue_arn" {
  description = "Indexer SQS queue ARN"
  type        = string
}

variable "indexer_queue_name" {
  description = "Indexer SQS queue name"
  type        = string
}

variable "liquidation_queue_url" {
  description = "Liquidation SQS queue URL"
  type        = string
}

variable "liquidation_queue_arn" {
  description = "Liquidation SQS queue ARN"
  type        = string
}

variable "liquidation_queue_name" {
  description = "Liquidation SQS queue name"
  type        = string
}

variable "bucket_name" {
  description = "S3 bucket name"
  type        = string
}

variable "bucket_arn" {
  description = "S3 bucket ARN"
  type        = string
}

variable "liquidation_seed_ssm_parameter_arn" {
  description = "SSM parameter ARN holding the liquidator seed phrase"
  type        = string
}

variable "radix_gateway_url" {
  description = "Radix Gateway API base URL"
  type        = string
}

variable "lending_market_component" {
  description = "The Radix Component Address for the Lending Market"
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
}

variable "ecs_indexer_cpu" {
  description = "CPU units for indexer task"
}

variable "ecs_indexer_memory" {
  description = "Memory for indexer task"
}

variable "ecs_liquidator_cpu" {
  description = "CPU units for liquidator task"
}

variable "ecs_liquidator_memory" {
  description = "Memory for liquidator task"
}

variable "ecs_indexer_min_capacity" {
  description = "Minimum tasks for indexer"
  type        = number
}

variable "ecs_indexer_max_capacity" {
  description = "Maximum tasks for indexer"
  type        = number
}

variable "ecs_liquidator_min_capacity" {
  description = "Minimum tasks for liquidator"
  type        = number
}

variable "ecs_liquidator_max_capacity" {
  description = "Maximum tasks for liquidator"
  type        = number
}

variable "ecs_indexer_scaling_target_value" {
  description = "SQS messages per task for indexer scaling"
  type        = number
}

variable "ecs_liquidator_scaling_target_value" {
  description = "SQS messages per task for liquidator scaling"
  type        = number
}

variable "ecs_indexer_scale_out_cooldown" {
  description = "Cool down after scale out for indexer"
  type        = number
}

variable "ecs_indexer_scale_in_cooldown" {
  description = "Cool down after scale in for indexer"
  type        = number
}

variable "ecs_liquidator_scale_out_cooldown" {
  description = "Cool down after scale out for liquidator"
  type        = number
}

variable "ecs_liquidator_scale_in_cooldown" {
  description = "Cool down after scale in for liquidator"
  type        = number
}

variable "indexer_image" {
  description = "Indexer container image (repository URL)"
  type        = string
}

variable "indexer_image_digest" {
  description = "SHA256 digest of the indexer image (e.g. sha256:...)"
  type        = string
  default     = ""
}

variable "liquidator_image" {
  description = "Liquidator container image (repository URL)"
  type        = string
}

variable "liquidator_image_digest" {
  description = "SHA256 digest of the liquidator image (e.g. sha256:...)"
  type        = string
  default     = ""
}
