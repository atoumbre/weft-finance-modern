terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  backend "s3" {}
}

provider "aws" {
  region = "us-east-1"
}

module "admin" {
  source = "../lib/blueprints/admin"

  aws_region = "us-east-1"
}


module "observability" {
  source = "../lib/blueprints/observability"

  aws_region                              = "us-east-1"
  ssm_parameter_name_grafana_metric_token = "/weft/oservability/grafana_metric_token"
  cloud_provider_url                      = "https://cloud-provider-api-prod-us-east-3.grafana.net"
  ssm_parameter_name_grafana_log_token    = "/weft/oservability/grafana_log_token"
  write_address                           = "https://logs-prod-042.grafana.net/loki/api/v1/push"
  username                                = "1432998"
  s3_bucket                               = "misc-admin-artefacts"
  s3_key                                  = "lambda-promtail.zip"
  keep_stream                             = "false"
  extra_labels                            = "env,weft"
  batch_size                              = "8192"
  log_group_names = [
    "/aws/lambda/weft-mainnet-dispatcher",
    "/aws/ecs/weft-mainnet-indexer",
    "/aws/ecs/weft-mainnet-liquidator",
    "/aws/lambda/weft-stokenet-dispatcher",
    "/aws/ecs/weft-stokenet-indexer",
    "/aws/ecs/weft-stokenet-liquidator"
  ]
}
