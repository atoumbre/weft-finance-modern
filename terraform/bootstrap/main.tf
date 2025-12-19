terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

variable "aws_region" {
  default = "us-east-1"
}

variable "budget_limit" {
  description = "Monthly budget limit in USD"
  type        = string
  default     = "10"
}

variable "notification_email" {
  description = "Email address for budget notifications"
  type        = string
  default     = "atoumbre@gmail.com"
}

resource "aws_budgets_budget" "monthly" {
  name              = "monthly-spend-budget"
  budget_type       = "COST"
  limit_amount      = var.budget_limit
  limit_unit        = "USD"
  time_period_start = "2024-01-01_00:00" # Broad start date
  time_unit         = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.notification_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.notification_email]
  }
}

# --- State Management ---

resource "aws_s3_bucket" "terraform_state" {
  bucket = "weft-terraform-state-${data.aws_caller_identity.current.account_id}"
  # force_destroy = false # Safety for production
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_dynamodb_table" "terraform_locks" {
  name         = "weft-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"
  attribute {
    name = "LockID"
    type = "S"
  }
}

output "param_state_bucket" {
  value = aws_s3_bucket.terraform_state.id
}

output "param_dynamodb_table" {
  value = aws_dynamodb_table.terraform_locks.name
}

# --- GitHub Actions CI/CD (OIDC) ---

variable "github_org" {
  description = "GitHub Organization or Username"
  type        = string
  default     = "atoumbre" # Based on your local path
}

variable "github_repo" {
  description = "GitHub Repository Name"
  type        = string
  default     = "weft-finance-modern"
}

# 1. OIDC Provider
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

# 2. IAM Role for GitHub Actions
resource "aws_iam_role" "github_actions" {
  name = "weft-github-actions-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Condition = {
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_org}/${var.github_repo}:*"
          }
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
        }
      }
    ]
  })
}

# 3. Policy for GitHub Actions
# Granting scoped permissions for infrastructure management.
resource "aws_iam_role_policy" "gha_scoped" {
  name = "weft-github-actions-policy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:*",
          "s3:*",
          "dynamodb:*",
          "ecs:*",
          "lambda:*",
          "iam:*",
          "sqs:*",
          "events:*",
          "scheduler:*",
          "logs:*",
          "ec2:*",
          "ssm:*",
          "sts:GetCallerIdentity"
        ]
        Resource = "*"
      }
    ]
  })
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions.arn
}
