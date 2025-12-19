variable "aws_region" {
  description = "AWS region"
}

variable "environment" {
  description = "Environment name (e.g. mainnet, testnet)"
}

variable "vpc_cidr_block" {
  description = "The CIDR block for the VPC"
}

variable "radix_gateway_url" {
}

variable "cdp_resource_address" {
  description = "The Radix Resource Address for CDPs"
}

variable "lending_market_component" {
  description = "The Radix Component Address for the Lending Market"
}

variable "telegram_bot_token" {
}

variable "telegram_chat_id" {
}

variable "liquidation_seed_phrase" {
  description = "Seed phrase for the liquidator wallet. Pass via environment variable TF_VAR_liquidation_seed_phrase or -var file. DO NOT COMMIT."
  sensitive   = true
}

variable "ssm_parameter_name_seed_phrase" {
  description = "The name of the SSM parameter storing the seed phrase"
}

# --- ECS Resource Sizing ---

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

# --- Auto Scaling Configuration ---

variable "ecs_indexer_min_capacity" {
  description = "Minimum tasks for indexer"
}

variable "ecs_indexer_max_capacity" {
  description = "Maximum tasks for indexer"
}

variable "ecs_liquidator_min_capacity" {
  description = "Minimum tasks for liquidator"
}

variable "ecs_liquidator_max_capacity" {
  description = "Maximum tasks for liquidator"
}

variable "ecs_indexer_scaling_target_value" {
  description = "SQS messages per task for indexer scaling"
}

variable "ecs_liquidator_scaling_target_value" {
  description = "SQS messages per task for liquidator scaling"
}

variable "ecs_indexer_scale_out_cooldown" {
  description = "Cool down after scale out for indexer"
}

variable "ecs_indexer_scale_in_cooldown" {
  description = "Cool down after scale in for indexer"
}

variable "ecs_liquidator_scale_out_cooldown" {
  description = "Cool down after scale out for liquidator"
}

variable "ecs_liquidator_scale_in_cooldown" {
  description = "Cool down after scale in for liquidator"
}

# --- Operational Settings ---

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
}

variable "sqs_visibility_timeout" {
  description = "Visibility timeout for SQS queues in seconds"
}

variable "sqs_max_receive_count" {
  description = "Max receive count before moving to DLQ"
}

# --- Dispatcher Configuration ---

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

