variable "ecs_indexer_cpu" {
  description = "CPU units for indexer task"
}

variable "ecs_indexer_memory" {
  description = "Memory for indexer task"
}
variable "ecs_indexer_min_capacity" {
  description = "Minimum tasks for indexer"
  type        = number
}
variable "ecs_indexer_max_capacity" {
  description = "Maximum tasks for indexer"
  type        = number
}

variable "ecs_indexer_scaling_target_value" {
  description = "SQS messages per task for indexer scaling"
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

variable "indexer_image_tag" {
  description = "Tag of the indexer image (e.g. v1.0.0 or latest)"
  type        = string
}


variable "indexer_sqs_visibility_timeout" {
  description = "Visibility timeout for SQS queues in seconds"
  type        = number
}

variable "indexer_sqs_max_receive_count" {
  description = "Max receive count before moving to DLQ"
  type        = number
}


resource "aws_ecr_repository" "indexer" {
  name = "weft-indexer"
}

resource "aws_sqs_queue" "indexer_dlq" {
  name = "weft-${var.environment}-indexer-queue-dlq"
}

resource "aws_sqs_queue" "indexer_queue" {
  name                       = "weft-${var.environment}-indexer-queue"
  visibility_timeout_seconds = var.indexer_sqs_visibility_timeout
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.indexer_dlq.arn
    maxReceiveCount     = var.indexer_sqs_max_receive_count
  })
}



module "indexer_service" {
  source = "./modules/ecs_autoscaling_service"

  service_name       = "indexer"
  family             = "weft-indexer"
  container_name     = "indexer"
  image              = local.indexer_image_full
  cpu                = var.ecs_indexer_cpu
  memory             = var.ecs_indexer_memory
  execution_role_arn = aws_iam_role.ecs_execution_role.arn
  task_role_arn      = aws_iam_role.indexer_task_role.arn
  aws_region         = var.aws_region
  log_retention_days = var.log_retention_days
  log_group_name     = "/aws/ecs/weft-${var.environment}-indexer"
  log_stream_prefix  = "indexer"
  environment = [
    { name = "QUEUE_URL", value = aws_sqs_queue.indexer_queue.id },
    { name = "LIQUIDATION_QUEUE_URL", value = aws_sqs_queue.liquidation_queue.id },
    { name = "BUCKET_NAME", value = aws_s3_bucket.main.id },
    { name = "RADIX_GATEWAY_URL", value = var.radix_gateway_url }
  ]
  cluster_id                     = aws_ecs_cluster.main.id
  cluster_name                   = aws_ecs_cluster.main.name
  subnet_ids                     = aws_subnet.public[*].id
  security_group_ids             = [aws_security_group.ecs_sg.id]
  assign_public_ip               = true
  capacity_provider              = "FARGATE_SPOT"
  min_capacity                   = var.ecs_indexer_min_capacity
  max_capacity                   = var.ecs_indexer_max_capacity
  scaling_policy_name            = "weft-${var.environment}-indexer-sqs-scaling"
  scaling_target_value           = var.ecs_indexer_scaling_target_value
  scale_in_cooldown              = var.ecs_indexer_scale_in_cooldown
  scale_out_cooldown             = var.ecs_indexer_scale_out_cooldown
  scaling_metric_dimension_value = aws_sqs_queue.indexer_queue.name
}




