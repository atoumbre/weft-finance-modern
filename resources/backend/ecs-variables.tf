
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

variable "indexer_image_digest" {
  description = "SHA256 digest of the indexer image (e.g. sha256:...)"
  type        = string
}

variable "liquidator_image_digest" {
  description = "SHA256 digest of the liquidator image (e.g. sha256:...)"
  type        = string
}
