variable "aws_region" {
  description = "AWS region (used for VPC endpoint service names)"
  type        = string
}

variable "environment" {
  description = "Environment name (e.g. mainnet, stokenet)"
  type        = string
}

variable "vpc_cidr_block" {
  description = "The CIDR block for the VPC"
  type        = string
}

variable "public_subnet_count" {
  description = "Number of public subnets to create"
  type        = number
  default     = 2
}
