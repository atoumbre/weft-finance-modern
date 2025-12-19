terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  default = "us-east-1"
}

resource "aws_ecr_repository" "indexer" {
  name = "weft-indexer"
}

resource "aws_ecr_repository" "liquidator" {
  name = "weft-liquidator"
}

output "indexer_repo_url" {
  value = aws_ecr_repository.indexer.repository_url
}

output "liquidator_repo_url" {
  value = aws_ecr_repository.liquidator.repository_url
}
