
variable "ecs_liquidator_cpu" {
  description = "CPU units for liquidator task"
}

variable "ecs_liquidator_memory" {
  description = "Memory for liquidator task"
}

variable "ecs_liquidator_min_capacity" {
  description = "Minimum tasks for liquidator"
  type        = number
}

variable "ecs_liquidator_max_capacity" {
  description = "Maximum tasks for liquidator"
  type        = number
}

variable "ecs_liquidator_scaling_target_value" {
  description = "SQS messages per task for liquidator scaling"
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

variable "liquidator_image_tag" {
  description = "Tag of the liquidator image (e.g. v1.0.0 or latest)"
  type        = string
}

variable "ssm_parameter_name_seed_phrase" {
  description = "The name of the SSM parameter storing the seed phrase"
  type        = string
}

variable "liquidator_sqs_visibility_timeout" {
  description = "Visibility timeout for SQS queues in seconds"
  type        = number
}

variable "liquidator_sqs_max_receive_count" {
  description = "Max receive count before moving to DLQ"
  type        = number
}


data "aws_ssm_parameter" "liquidation_seed" {
  name = var.ssm_parameter_name_seed_phrase
}

module "liquidator_service" {
  source = "../../modules/ecs_autoscaling_service"

  service_name       = "weft-${var.environment}-liquidator"
  cpu                = var.ecs_liquidator_cpu
  memory             = var.ecs_liquidator_memory
  execution_role_arn = aws_iam_role.ecs_execution_role.arn
  aws_region         = var.aws_region

  create_ecr_repo  = true
  ecr_repo_name    = "weft-liquidator"
  create_task_role = true

  logging_config = {
    retention_days = var.log_retention_days
    group_name     = "/aws/ecs/weft-${var.environment}-liquidator"
    stream_prefix  = "liquidator"
  }

  scaling_config = {
    min_capacity       = var.ecs_liquidator_min_capacity
    max_capacity       = var.ecs_liquidator_max_capacity
    target_value       = var.ecs_liquidator_scaling_target_value
    scale_in_cooldown  = var.ecs_liquidator_scale_in_cooldown
    scale_out_cooldown = var.ecs_liquidator_scale_out_cooldown
    dimension_value    = "weft-${var.environment}-indexer-liquidation-queue"
  }

  network_config = {
    cluster_id         = aws_ecs_cluster.main.id
    cluster_name       = aws_ecs_cluster.main.name
    subnet_ids         = var.subnet_ids
    security_group_ids = [aws_security_group.ecs_sg.id]
  }

  environment = [
    { name = "LIQUIDATION_QUEUE_URL", value = module.indexer_service.queues["liquidation"].id },
    { name = "RADIX_GATEWAY_URL", value = var.radix_gateway_url },
    { name = "LOG_LEVEL", value = var.log_level }
  ]
  sqs_permissions = [
    {
      queue_arn   = module.indexer_service.queues["liquidation"].arn
      access_type = "read"
    }
  ]
  secrets = [
    {
      name       = "SEED_PHRASE"
      value_from = data.aws_ssm_parameter.liquidation_seed.arn
    }
  ]
}




