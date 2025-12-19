environment                    = "stokenet"
radix_gateway_url              = "https://stokenet.radixdlt.com/"
cdp_resource_address           = "resource_tdx_2_..."  # Replace with Stokenet Resource Address
lending_market_component       = "component_tdx_2_..." # Replace with Stokenet Component Address
telegram_bot_token             = "YOUR_STOKENET_TELEGRAM_TOKEN"
telegram_chat_id               = "-100..."
ssm_parameter_name_seed_phrase = "/weft/stokenet/liquidation_seed_phrase"
dispatcher_schedule            = "rate(5 minutes)"
aws_region                     = "us-east-1"
indexer_batch_size             = 1000
vpc_cidr_block                 = "10.1.0.0/16"

# CloudWatch Configs

log_retention_days = 14

# Lambda Configs

dispatcher_memory  = 512
dispatcher_timeout = 300

# SQS Configs

sqs_visibility_timeout = 300
sqs_max_receive_count  = 3

# ECS Configs

ecs_indexer_cpu       = "256"
ecs_indexer_memory    = "512"
ecs_liquidator_cpu    = "256"
ecs_liquidator_memory = "512"

# Indexer Auto Scaling

ecs_indexer_min_capacity         = 1
ecs_indexer_max_capacity         = 5
ecs_indexer_scaling_target_value = 100.0
ecs_indexer_scale_out_cooldown   = 60
ecs_indexer_scale_in_cooldown    = 60

# Liquidator Auto Scaling

ecs_liquidator_min_capacity         = 0
ecs_liquidator_max_capacity         = 5
ecs_liquidator_scaling_target_value = 10.0
ecs_liquidator_scale_out_cooldown   = 30
ecs_liquidator_scale_in_cooldown    = 30
