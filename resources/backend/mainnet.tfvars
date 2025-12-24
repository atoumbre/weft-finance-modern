aws_region  = "us-east-1"
environment = "mainnet"

radix_gateway_url = "https://mainnet.radixdlt.com/"

indexer_image_tag    = ""
liquidator_image_tag = ""

# VPC Configs

vpc_cidr_block      = "10.0.0.0/16"
public_subnet_count = 2

# CloudWatch Configs

log_retention_days = 7

# Lambda Configs

dispatcher_schedule = "rate(5 minutes)"
dispatcher_memory   = 128
dispatcher_timeout  = 300

# SQS Configs

indexer_sqs_visibility_timeout    = 600
indexer_sqs_max_receive_count     = 3
liquidator_sqs_visibility_timeout = 600
liquidator_sqs_max_receive_count  = 3

# ECS Configs

ecs_indexer_cpu       = "256"
ecs_indexer_memory    = "512"
ecs_liquidator_cpu    = "256"
ecs_liquidator_memory = "512"

# Indexer Auto Scaling

indexer_batch_size = 500

ecs_indexer_min_capacity         = 1
ecs_indexer_max_capacity         = 5
ecs_indexer_scaling_target_value = 100.0
ecs_indexer_scale_out_cooldown   = 60
ecs_indexer_scale_in_cooldown    = 60

# Liquidator Auto Scaling

ssm_parameter_name_seed_phrase = "/weft/mainnet/liquidation_seed_phrase"

ecs_liquidator_min_capacity         = 0
ecs_liquidator_max_capacity         = 5
ecs_liquidator_scaling_target_value = 100.0
ecs_liquidator_scale_out_cooldown   = 60
ecs_liquidator_scale_in_cooldown    = 60

# Oracle Updater Configs

oracle_updater_schedule               = "rate(10 minutes)"
oracle_updater_timeout                = 300
oracle_updater_memory                 = 128
oracle_updater_account_address        = "TODO_MAINNET_ADDRESS"
oracle_updater_badge_resource_address = "TODO_MAINNET_ADDRESS"
oracle_updater_component_address      = "TODO_MAINNET_ADDRESS"
