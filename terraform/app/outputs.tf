output "s3_bucket_name" {
  value = aws_s3_bucket.main.id
}

output "indexer_queue_url" {
  value = aws_sqs_queue.indexer_queue.id
}

output "indexer_queue_arn" {
  value = aws_sqs_queue.indexer_queue.arn
}

output "liquidation_queue_url" {
  value = aws_sqs_queue.liquidation_queue.id
}

output "dispatcher_function_name" {
  value = aws_lambda_function.dispatcher.function_name
}
