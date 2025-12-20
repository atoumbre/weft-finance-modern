output "param_state_region" {
  value = var.aws_region
}

output "param_state_bucket" {
  value = aws_s3_bucket.terraform_state.id
}

output "param_dynamodb_table" {
  value = aws_dynamodb_table.terraform_locks.name
}

