//

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5"
    }
    grafana = {
      source  = "grafana/grafana"
      version = ">= 3.24.1"
    }
  }

  backend "s3" {}
}

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

variable "ssm_parameter_name_grafana_metric_token" {
  type = string
}

variable "ssm_parameter_name_grafana_log_token" {
  type = string
}

data "aws_ssm_parameter" "grafana_metric_token" {
  name = var.ssm_parameter_name_grafana_metric_token
}

data "aws_ssm_parameter" "grafana_log_token" {
  name = var.ssm_parameter_name_grafana_log_token
}

