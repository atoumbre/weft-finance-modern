variable "aws_region" {
  description = "AWS region"
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (e.g. mainnet, testnet)"
  default     = "mainnet"
}

variable "dispatcher_schedule" {
  description = "Schedule expression for dispatcher"
  default     = "rate(1 minute)"
}

variable "indexer_batch_size" {
  description = "Number of CDPs per batch"
  default     = 10
}

variable "radix_gateway_url" {
  default = "https://mainnet.radixdlt.com/"
}

variable "cdp_resource_address" {
  description = "The Radix Resource Address for CDPs"
}

variable "lending_market_component" {
  description = "The Radix Component Address for the Lending Market"
}

variable "telegram_bot_token" {
  default = "placeholder"
}

variable "telegram_chat_id" {
  default = "placeholder"
}

variable "liquidation_seed_phrase" {
  description = "Seed phrase for the liquidator wallet"
  default     = "test test test"
}
