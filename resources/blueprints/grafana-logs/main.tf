
variable "aws_region" {
  description = "AWS region to deploy observability resources into."
  type        = string
}

variable "ssm_parameter_name_grafana_log_token" {
  type = string
}

data "aws_caller_identity" "current" {}

data "aws_ssm_parameter" "grafana_log_token" {
  name = var.ssm_parameter_name_grafana_log_token
}
