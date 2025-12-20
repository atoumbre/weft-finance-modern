aws_region  = "us-east-1"
environment = "mainnet"

radix_gateway_url              = "https://mainnet.radixdlt.com/"
ssm_parameter_name_seed_phrase = "/weft/mainnet/liquidation_seed_phrase"
dispatcher_schedule            = "rate(5 minutes)"
indexer_batch_size             = 500
vpc_cidr_block                 = "10.0.0.0/16"
public_subnet_count            = 2
indexer_image_digest           = ""
liquidator_image_digest        = ""

# CloudWatch Configs

log_retention_days = 7

# Lambda Configs

dispatcher_memory  = 128
dispatcher_timeout = 300

# SQS Configs

sqs_visibility_timeout = 600
sqs_max_receive_count  = 3

# ECS Configs

ecs_indexer_cpu       = "256"
ecs_indexer_memory    = "128"
ecs_liquidator_cpu    = "256"
ecs_liquidator_memory = "128"

# Indexer Auto Scaling

ecs_indexer_min_capacity         = 1
ecs_indexer_max_capacity         = 5
ecs_indexer_scaling_target_value = 100.0
ecs_indexer_scale_out_cooldown   = 60
ecs_indexer_scale_in_cooldown    = 60

# Liquidator Auto Scaling

ecs_liquidator_min_capacity         = 0
ecs_liquidator_max_capacity         = 5
ecs_liquidator_scaling_target_value = 100.0
ecs_liquidator_scale_out_cooldown   = 60
ecs_liquidator_scale_in_cooldown    = 60
