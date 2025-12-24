
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



resource "aws_ecr_repository" "liquidator" {
  name = "weft-liquidator"
}


resource "aws_sqs_queue" "liquidation_dlq" {
  name = "weft-${var.environment}-liquidation-queue-dlq"
}

resource "aws_sqs_queue" "liquidation_queue" {
  name                       = "weft-${var.environment}-liquidation-queue"
  visibility_timeout_seconds = var.liquidator_sqs_visibility_timeout
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.liquidation_dlq.arn
    maxReceiveCount     = var.liquidator_sqs_max_receive_count
  })
}

resource "aws_s3_bucket" "main" {
  bucket_prefix = "weft-${var.environment}-data-"
  force_destroy = true
}

data "aws_ssm_parameter" "liquidation_seed" {
  name = var.ssm_parameter_name_seed_phrase
}



module "liquidator_service" {
  source = "./modules/ecs_autoscaling_service"

  service_name       = "liquidator"
  family             = "weft-liquidator"
  container_name     = "liquidator"
  image              = local.liquidator_image_full
  cpu                = var.ecs_liquidator_cpu
  memory             = var.ecs_liquidator_memory
  execution_role_arn = aws_iam_role.ecs_execution_role.arn
  task_role_arn      = aws_iam_role.liquidator_task_role.arn
  aws_region         = var.aws_region
  log_retention_days = var.log_retention_days
  log_group_name     = "/aws/ecs/weft-${var.environment}-liquidator"
  log_stream_prefix  = "liquidator"
  environment = [
    { name = "LIQUIDATION_QUEUE_URL", value = aws_sqs_queue.liquidation_queue.id },
    { name = "RADIX_GATEWAY_URL", value = var.radix_gateway_url },
  ]
  secrets = [
    {
      name       = "SEED_PHRASE"
      value_from = data.aws_ssm_parameter.liquidation_seed.arn
    }
  ]
  cluster_id                     = aws_ecs_cluster.main.id
  cluster_name                   = aws_ecs_cluster.main.name
  subnet_ids                     = aws_subnet.public[*].id
  security_group_ids             = [aws_security_group.ecs_sg.id]
  assign_public_ip               = true
  capacity_provider              = "FARGATE_SPOT"
  min_capacity                   = var.ecs_liquidator_min_capacity
  max_capacity                   = var.ecs_liquidator_max_capacity
  scaling_policy_name            = "weft-${var.environment}-liquidator-sqs-scaling"
  scaling_target_value           = var.ecs_liquidator_scaling_target_value
  scale_in_cooldown              = var.ecs_liquidator_scale_in_cooldown
  scale_out_cooldown             = var.ecs_liquidator_scale_out_cooldown
  scaling_metric_dimension_value = aws_sqs_queue.liquidation_queue.name
}
