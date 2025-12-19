environment                    = "mainnet"
radix_gateway_url              = "https://mainnet.radixdlt.com/"
cdp_resource_address           = "resource_rdx1nt22yfvhuuhxww7jnnml5ec3yt5pkxh0qlghm6f0hz46z2wfk80s9r"
lending_market_component       = "component_rdx1cpy6putj5p7937clqgcgutza7k53zpha039n9u5hkk0ahh4stdmq4w"
telegram_bot_token             = "YOUR_TELEGRAM_TOKEN"
telegram_chat_id               = "-1002096524333"
ssm_parameter_name_seed_phrase = "/weft/mainnet/liquidation_seed_phrase"
dispatcher_schedule            = "rate(5 minutes)"
aws_region                     = "us-east-1"
indexer_batch_size             = 500
vpc_cidr_block                 = "10.0.0.0/16"

# CloudWatch Configs

log_retention_days = 7

# Lambda Configs

dispatcher_memory  = 128
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
ecs_indexer_scale_out_cooldown   = 300
ecs_indexer_scale_in_cooldown    = 60

# Liquidator Auto Scaling

ecs_liquidator_min_capacity         = 1
ecs_liquidator_max_capacity         = 5
ecs_liquidator_scaling_target_value = 100.0
ecs_liquidator_scale_out_cooldown   = 300
ecs_liquidator_scale_in_cooldown    = 60
