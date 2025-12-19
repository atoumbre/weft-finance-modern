output "s3_bucket_name" {
  value = module.common.s3_bucket_name
}

output "indexer_queue_url" {
  value = module.common.indexer_queue_url
}

output "indexer_queue_arn" {
  value = module.common.indexer_queue_arn
}

output "liquidation_queue_url" {
  value = module.common.liquidation_queue_url
}

output "dispatcher_function_name" {
  value = module.dispatcher.dispatcher_function_name
}
