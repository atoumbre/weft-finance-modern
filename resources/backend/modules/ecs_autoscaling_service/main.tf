// VARIABLES

variable "service_name" {
  description = "ECS service name"
  type        = string
}

variable "family" {
  description = "Task definition family"
  type        = string
}

variable "container_name" {
  description = "Container name"
  type        = string
}

variable "image" {
  description = "Container image"
  type        = string
}

variable "cpu" {
  description = "Task CPU"
  type        = string
}

variable "memory" {
  description = "Task memory"
  type        = string
}

variable "execution_role_arn" {
  description = "ECS execution role ARN"
  type        = string
}

variable "task_role_arn" {
  description = "ECS task role ARN"
  type        = string
}

variable "aws_region" {
  description = "AWS region for logs"
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention days"
  type        = number
}

variable "log_group_name" {
  description = "CloudWatch log group name"
  type        = string
}

variable "log_stream_prefix" {
  description = "CloudWatch log stream prefix"
  type        = string
}

variable "environment" {
  description = "Container environment variables"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

variable "secrets" {
  description = "Container secrets"
  type = list(object({
    name       = string
    value_from = string
  }))
  default = []
}

variable "cluster_id" {
  description = "ECS cluster ID"
  type        = string
}

variable "cluster_name" {
  description = "ECS cluster name"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for the service"
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security group IDs for the service"
  type        = list(string)
}

variable "assign_public_ip" {
  description = "Assign public IP in awsvpc mode"
  type        = bool
  default     = true
}

variable "capacity_provider" {
  description = "Capacity provider name"
  type        = string
  default     = "FARGATE_SPOT"
}

variable "min_capacity" {
  description = "Minimum autoscaling capacity"
  type        = number
}

variable "max_capacity" {
  description = "Maximum autoscaling capacity"
  type        = number
}

variable "scaling_policy_name" {
  description = "Autoscaling policy name"
  type        = string
}

variable "scaling_target_value" {
  description = "Target value for autoscaling"
  type        = number
}

variable "scale_in_cooldown" {
  description = "Scale in cooldown"
  type        = number
}

variable "scale_out_cooldown" {
  description = "Scale out cooldown"
  type        = number
}

variable "scaling_metric_name" {
  description = "Metric name for autoscaling"
  type        = string
  default     = "ApproximateNumberOfMessagesVisible"
}

variable "scaling_metric_namespace" {
  description = "Metric namespace for autoscaling"
  type        = string
  default     = "AWS/SQS"
}

variable "scaling_metric_unit" {
  description = "Metric unit for autoscaling"
  type        = string
  default     = "Count"
}

variable "scaling_metric_statistic" {
  description = "Metric statistic for autoscaling"
  type        = string
  default     = "Average"
}

variable "scaling_metric_dimension_name" {
  description = "Metric dimension name"
  type        = string
  default     = "QueueName"
}

variable "scaling_metric_dimension_value" {
  description = "Metric dimension value"
  type        = string
}


// RESOURCES


resource "aws_ecs_task_definition" "service" {
  family                   = var.family
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name        = var.container_name
    image       = var.image
    environment = var.environment
    secrets = [
      for secret in var.secrets : {
        name      = secret.name
        valueFrom = secret.value_from
      }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = var.log_group_name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = var.log_stream_prefix
      }
    }
  }])
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = var.log_group_name
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_service" "service" {
  name            = var.service_name
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.service.arn

  capacity_provider_strategy {
    capacity_provider = var.capacity_provider
    weight            = 100
  }

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = var.security_group_ids
    assign_public_ip = var.assign_public_ip
  }

}

resource "aws_appautoscaling_target" "service" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${var.cluster_name}/${aws_ecs_service.service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "sqs_scaling" {
  name               = var.scaling_policy_name
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.service.resource_id
  scalable_dimension = aws_appautoscaling_target.service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.service.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = var.scaling_target_value
    scale_in_cooldown  = var.scale_in_cooldown
    scale_out_cooldown = var.scale_out_cooldown

    customized_metric_specification {
      metric_name = var.scaling_metric_name
      namespace   = var.scaling_metric_namespace
      statistic   = var.scaling_metric_statistic
      unit        = var.scaling_metric_unit
      dimensions {
        name  = var.scaling_metric_dimension_name
        value = var.scaling_metric_dimension_value
      }
    }
  }
}
