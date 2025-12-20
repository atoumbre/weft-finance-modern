
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

  default_tags {
    tags = {
      Environment = var.environment
      ManagedBy   = "terraform"
      Project     = "weft"
    }
  }
}

resource "aws_sqs_queue" "indexer_dlq" {
  name = "weft-${var.environment}-indexer-queue-dlq"
}

resource "aws_sqs_queue" "indexer_queue" {
  name                       = "weft-${var.environment}-indexer-queue"
  visibility_timeout_seconds = var.sqs_visibility_timeout
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.indexer_dlq.arn
    maxReceiveCount     = var.sqs_max_receive_count
  })
}

resource "aws_sqs_queue" "liquidation_dlq" {
  name = "weft-${var.environment}-liquidation-queue-dlq"
}

resource "aws_sqs_queue" "liquidation_queue" {
  name                       = "weft-${var.environment}-liquidation-queue"
  visibility_timeout_seconds = var.sqs_visibility_timeout
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.liquidation_dlq.arn
    maxReceiveCount     = var.sqs_max_receive_count
  })
}

resource "aws_s3_bucket" "main" {
  bucket_prefix = "weft-${var.environment}-data-"
  force_destroy = true
}

data "aws_ssm_parameter" "liquidation_seed" {
  name = var.ssm_parameter_name_seed_phrase
}

