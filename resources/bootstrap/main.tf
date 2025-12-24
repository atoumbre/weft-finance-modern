
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "aws_region" {
  type        = string
  description = "AWS region to deploy resources into."
  default     = "us-east-1"
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

module "terraform_state_bucket" {
  source = "../lib/modules/secure_s3_bucket"

  bucket_name = "admin-terraform-state-${data.aws_caller_identity.current.account_id}"

  # TODO: remove after development is done
  force_destroy = true
}

module "artifacts_bucket" {
  source = "../lib/modules/secure_s3_bucket"

  bucket_name = "admin-misc-artifacts-${data.aws_caller_identity.current.account_id}"

  # TODO: remove after development is done
  force_destroy = true
}



