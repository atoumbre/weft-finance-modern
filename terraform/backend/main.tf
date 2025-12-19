terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
}

# Look up the pre-created ECR Repositories
data "aws_ecr_repository" "indexer" {
  name = "weft-indexer"
}

data "aws_ecr_repository" "liquidator" {
  name = "weft-liquidator"
}

module "common" {
  source = "./modules/common"

  environment                    = var.environment
  sqs_visibility_timeout         = var.sqs_visibility_timeout
  sqs_max_receive_count          = var.sqs_max_receive_count
  ssm_parameter_name_seed_phrase = var.ssm_parameter_name_seed_phrase
  liquidation_seed_phrase        = var.liquidation_seed_phrase
}

module "vpc" {
  source = "./modules/vpc"

  environment    = var.environment
  vpc_cidr_block = var.vpc_cidr_block
}

module "ecs" {
  source = "./modules/ecs"

  environment = var.environment
  aws_region  = var.aws_region

  public_subnet_ids     = module.vpc.public_subnet_ids
  ecs_security_group_id = module.vpc.ecs_security_group_id

  indexer_queue_url  = module.common.indexer_queue_url
  indexer_queue_arn  = module.common.indexer_queue_arn
  indexer_queue_name = module.common.indexer_queue_name

  liquidation_queue_url  = module.common.liquidation_queue_url
  liquidation_queue_arn  = module.common.liquidation_queue_arn
  liquidation_queue_name = module.common.liquidation_queue_name

  bucket_name                        = module.common.s3_bucket_name
  bucket_arn                         = module.common.s3_bucket_arn
  liquidation_seed_ssm_parameter_arn = module.common.liquidation_seed_ssm_parameter_arn

  radix_gateway_url        = var.radix_gateway_url
  lending_market_component = var.lending_market_component
  log_retention_days       = var.log_retention_days

  ecs_indexer_cpu    = var.ecs_indexer_cpu
  ecs_indexer_memory = var.ecs_indexer_memory

  ecs_liquidator_cpu    = var.ecs_liquidator_cpu
  ecs_liquidator_memory = var.ecs_liquidator_memory

  ecs_indexer_min_capacity         = var.ecs_indexer_min_capacity
  ecs_indexer_max_capacity         = var.ecs_indexer_max_capacity
  ecs_indexer_scaling_target_value = var.ecs_indexer_scaling_target_value
  ecs_indexer_scale_out_cooldown   = var.ecs_indexer_scale_out_cooldown
  ecs_indexer_scale_in_cooldown    = var.ecs_indexer_scale_in_cooldown

  ecs_liquidator_min_capacity         = var.ecs_liquidator_min_capacity
  ecs_liquidator_max_capacity         = var.ecs_liquidator_max_capacity
  ecs_liquidator_scaling_target_value = var.ecs_liquidator_scaling_target_value
  ecs_liquidator_scale_out_cooldown   = var.ecs_liquidator_scale_out_cooldown
  ecs_liquidator_scale_in_cooldown    = var.ecs_liquidator_scale_in_cooldown

  indexer_image    = data.aws_ecr_repository.indexer.repository_url
  liquidator_image = data.aws_ecr_repository.liquidator.repository_url
}

module "dispatcher" {
  source = "./modules/dispatcher"

  environment        = var.environment
  aws_region         = var.aws_region
  log_retention_days = var.log_retention_days

  indexer_queue_url  = module.common.indexer_queue_url
  indexer_queue_arn  = module.common.indexer_queue_arn
  radix_gateway_url  = var.radix_gateway_url
  indexer_batch_size = var.indexer_batch_size

  dispatcher_schedule = var.dispatcher_schedule
  dispatcher_timeout  = var.dispatcher_timeout
  dispatcher_memory   = var.dispatcher_memory
}

