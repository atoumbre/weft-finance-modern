output "s3_bucket_name" {
  value = aws_s3_bucket.main.id
}

output "indexer_queue_url" {
  value = aws_sqs_queue.indexer_queue.id
}

output "liquidation_queue_url" {
  value = aws_sqs_queue.liquidation_queue.id
}

output "dispatcher_function_name" {
  value = aws_lambda_function.dispatcher.function_name
}

output "ecr_repository_indexer" {
  value = aws_ecr_repository.indexer.repository_url
}

output "ecr_repository_liquidator" {
  value = aws_ecr_repository.liquidator.repository_url
}
