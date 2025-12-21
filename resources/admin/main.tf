
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {}
}

variable "aws_region" {
  default = "us-east-1"
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}


