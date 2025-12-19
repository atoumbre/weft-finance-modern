output "indexer_queue_url" {
  value = aws_sqs_queue.indexer_queue.id
}

output "indexer_queue_arn" {
  value = aws_sqs_queue.indexer_queue.arn
}

output "indexer_queue_name" {
  value = aws_sqs_queue.indexer_queue.name
}

output "liquidation_queue_url" {
  value = aws_sqs_queue.liquidation_queue.id
}

output "liquidation_queue_arn" {
  value = aws_sqs_queue.liquidation_queue.arn
}

output "liquidation_queue_name" {
  value = aws_sqs_queue.liquidation_queue.name
}

output "s3_bucket_name" {
  value = aws_s3_bucket.main.id
}

output "s3_bucket_arn" {
  value = aws_s3_bucket.main.arn
}

output "liquidation_seed_ssm_parameter_arn" {
  value = aws_ssm_parameter.liquidation_seed.arn
}

