variable "aws_region" {
  type = string
}

data "aws_caller_identity" "current" {}

module "networking" {
  source = "../../blueprints/networking"

  vpc_cidr_block      = "10.0.0.0/16"
  public_subnet_count = 2
  tags = {
    Environment = "mainnet"
    ManagedBy   = "Terraform"
  }
}

module "liquitation_service" {
  source = "../../blueprints/liquitation-service"

  aws_region  = var.aws_region
  environment = "mainnet"
  vpc_id      = module.networking.vpc_id
  subnet_ids  = module.networking.public_subnet_ids

  radix_gateway_url  = "https://mainnet.radixdlt.com/"
  log_retention_days = 7
  log_level          = "info"

  # ECS Configs
  ecs_indexer_cpu       = "256"
  ecs_indexer_memory    = "512"
  ecs_liquidator_cpu    = "256"
  ecs_liquidator_memory = "512"

  indexer_image_tag    = ""
  liquidator_image_tag = ""

  indexer_batch_size = 500

  ecs_indexer_min_capacity         = 0
  ecs_indexer_max_capacity         = 2
  ecs_indexer_scaling_target_value = 30
  ecs_indexer_scale_out_cooldown   = 30
  ecs_indexer_scale_in_cooldown    = 300

  indexer_sqs_visibility_timeout = 600
  indexer_sqs_max_receive_count  = 3

  ssm_parameter_name_seed_phrase = "/weft/mainnet/liquidation_seed_phrase"

  ecs_liquidator_min_capacity         = 0
  ecs_liquidator_max_capacity         = 3
  ecs_liquidator_scaling_target_value = 30
  ecs_liquidator_scale_out_cooldown   = 30
  ecs_liquidator_scale_in_cooldown    = 300

  liquidator_sqs_visibility_timeout = 600
  liquidator_sqs_max_receive_count  = 3

  dispatcher_schedule = "rate(1 minutes)"
  dispatcher_memory   = 128
  dispatcher_timeout  = 300
}

module "price_updater_service" {
  source = "../../blueprints/price-updater-service"

  function_name      = "weft-mainnet-oracle-updater"
  log_retention_days = 7
  log_level          = "info"

  oracle_updater_schedule               = "rate(1 minutes)"
  oracle_updater_timeout                = 300
  oracle_updater_memory                 = 128
  oracle_updater_account_address        = "TODO_MAINNET_ADDRESS"
  oracle_updater_badge_resource_address = "TODO_MAINNET_ADDRESS"
  oracle_updater_component_address      = "TODO_MAINNET_ADDRESS"
  oracle_updater_badge_nft_id           = "#1#"

  ssm_parameter_name_seed_phrase = "/weft/mainnet/liquidation_seed_phrase"
}

module "admin" {
  source = "../../blueprints/admin"

  budget_limit       = "100"
  notification_email = "alerts@example.com"
  budget_alerts = [
    { notification_type = "ACTUAL", threshold = 85 },
    { notification_type = "FORECASTED", threshold = 100 }
  ]
}

module "grafana_metrics" {
  source = "../../blueprints/grafana-metrics"

  aws_region                              = var.aws_region
  cloud_provider_url                      = "https://cloud-provider-api-prod-us-east-3.grafana.net"
  ssm_parameter_name_grafana_metric_token = "/weft/observability/grafana_metric_token"

  grafana_cloud_stack_slug = "atoumbre"
  include_namespaces       = ["AWS/ECS", "AWS/SQS", "AWS/Lambda"]
}

module "grafana_logs" {
  source = "../../blueprints/grafana-logs"

  aws_region                           = var.aws_region
  ssm_parameter_name_grafana_log_token = "/weft/observability/grafana_log_token"

  write_address = "https://logs-prod-042.grafana.net/loki/api/v1/push"
  username      = "1432998"
  s3_bucket     = module.admin.artifacts_bucket_id
  s3_key        = "lambda-promtail.zip"
  keep_stream   = "false"
  extra_labels  = "app,weft,env,mainnet"
  batch_size    = "8192"
  log_group_names = [
    "/aws/lambda/weft-mainnet-dispatcher",
    "/aws/ecs/weft-mainnet-indexer",
    "/aws/ecs/weft-mainnet-liquidator"
  ]
}
