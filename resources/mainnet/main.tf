terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    grafana = {
      source  = "grafana/grafana"
      version = ">= 3.24.1"
    }
  }
  backend "s3" {}
}

provider "aws" {
  region = "us-east-1"
}

data "aws_caller_identity" "current" {}

module "mainnet_backend" {
  source = "../lib/blueprints/backend"

  aws_region  = "us-east-1"
  environment = "mainnet"

  radix_gateway_url = "https://mainnet.radixdlt.com/"

  indexer_image_tag    = ""
  liquidator_image_tag = ""

  log_level = "info"

  # VPC Configs
  vpc_cidr_block      = "10.0.0.0/16"
  public_subnet_count = 2

  # CloudWatch Configs
  log_retention_days = 7

  # ECS Configs
  ecs_indexer_cpu       = "256"
  ecs_indexer_memory    = "512"
  ecs_liquidator_cpu    = "256"
  ecs_liquidator_memory = "512"

  # Indexer Auto Scaling
  # The dispatcher sends 2 messages per minute (batches of ~500 CDPs).
  # We keep 1 task always-on to avoid cold start delays.

  indexer_batch_size = 500

  ecs_indexer_min_capacity         = 0   # Always-on to handle predictable load
  ecs_indexer_max_capacity         = 2   # Max 2 messages/min, so 2 tasks is plenty
  ecs_indexer_scaling_target_value = 5   # 1 message per task
  ecs_indexer_scale_out_cooldown   = 30  # Fast scale-out
  ecs_indexer_scale_in_cooldown    = 300 # Slow scale-in to prevent oscillation

  indexer_sqs_visibility_timeout = 600
  indexer_sqs_max_receive_count  = 3

  # Liquidator Auto Scaling
  # Liquidations are bursty and rare. Scale from 0 to save costs.
  ssm_parameter_name_seed_phrase = "/weft/mainnet/liquidation_seed_phrase"

  ecs_liquidator_min_capacity         = 0   # Scale from 0 to save costs
  ecs_liquidator_max_capacity         = 3   # Enough for concurrent at-risk CDPs
  ecs_liquidator_scaling_target_value = 5   # 1 message per task for fast response
  ecs_liquidator_scale_out_cooldown   = 30  # Fast scale-out for time-sensitive liquidations
  ecs_liquidator_scale_in_cooldown    = 300 # Slow scale-in

  liquidator_sqs_visibility_timeout = 600
  liquidator_sqs_max_receive_count  = 3


  # Dispatcher Config (Lambda)
  dispatcher_schedule = "rate(1 minutes)"
  dispatcher_memory   = 128
  dispatcher_timeout  = 300


  # Oracle Updater Configs (Lambda)
  oracle_updater_schedule               = "rate(1 minutes)"
  oracle_updater_timeout                = 300
  oracle_updater_memory                 = 128
  oracle_updater_account_address        = "TODO_MAINNET_ADDRESS"
  oracle_updater_badge_resource_address = "TODO_MAINNET_ADDRESS"
  oracle_updater_component_address      = "TODO_MAINNET_ADDRESS"
  oracle_updater_badge_nft_id           = "#1#"
}

module "observability_mainnet" {
  source = "../lib/blueprints/observability"

  aws_region                              = "us-east-1"
  grafana_cloud_stack_slug                = "atoumbre"
  ssm_parameter_name_grafana_metric_token = "/weft/oservability/grafana_metric_token"
  cloud_provider_url                      = "https://cloud-provider-api-prod-us-east-3.grafana.net"
  ssm_parameter_name_grafana_log_token    = "/weft/oservability/grafana_log_token"
  write_address                           = "https://logs-prod-042.grafana.net/loki/api/v1/push"
  username                                = "1432998"
  s3_bucket                               = "admin-misc-artifacts-${data.aws_caller_identity.current.account_id}"
  s3_key                                  = "lambda-promtail.zip"
  keep_stream                             = "false"
  extra_labels                            = "app,weft,env,mainnet"
  batch_size                              = "8192"
  include_namespaces                      = ["AWS/ECS", "AWS/SQS", "AWS/EC2", "AWS/Lambda"]
  log_group_names = [
    "/aws/lambda/weft-mainnet-dispatcher",
    "/aws/ecs/weft-mainnet-indexer",
    "/aws/ecs/weft-mainnet-liquidator"
  ]
}
