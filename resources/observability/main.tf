
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

variable "aws_region" {
  description = "AWS region to deploy observability resources into."
  type        = string
}

variable "cloud_provider_url" {
  description = "URL to call Grafana Cloud's Cloud Provider API"
  type        = string
}

provider "aws" {
  // FILL ME: AWS region
  region = var.aws_region

  // FILL ME: local AWS profile to use
  # profile = "default"
}

provider "grafana" {
  cloud_provider_access_token = data.aws_ssm_parameter.grafana_metric_token.value
  cloud_access_policy_token   = data.aws_ssm_parameter.grafana_metric_token.value
  cloud_provider_url          = var.cloud_provider_url
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

