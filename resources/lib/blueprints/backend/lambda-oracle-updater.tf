variable "oracle_updater_schedule" {
  description = "Schedule expression for oracle updater (e.g. rate(5 minutes))"
  type        = string
}

variable "oracle_updater_timeout" {
  description = "Timeout for oracle updater Lambda in seconds"
  type        = number
}

variable "oracle_updater_memory" {
  description = "Memory size for oracle updater Lambda in MB"
  type        = number
}

variable "oracle_updater_account_address" {
  description = "Account address used by oracle updater"
  type        = string
}

variable "oracle_updater_badge_resource_address" {
  description = "Badge resource address used by oracle updater"
  type        = string
}

variable "oracle_updater_component_address" {
  description = "Oracle component address"
  type        = string
}

variable "oracle_updater_badge_nft_id" {
  description = "Badge NFT ID used by oracle updater"
  type        = string
  default     = "#1#"
}

module "oracle_updater" {
  source = "../../modules/scheduled_lambda"

  function_name      = "weft-${var.environment}-oracle-updater"
  schedule           = var.oracle_updater_schedule
  timeout            = var.oracle_updater_timeout
  memory             = var.oracle_updater_memory
  log_retention_days = var.log_retention_days
  environment_variables = {
    ACCOUNT_ADDRESS          = var.oracle_updater_account_address
    BADGE_RESOURCE_ADDRESS   = var.oracle_updater_badge_resource_address
    ORACLE_COMPONENT_ADDRESS = var.oracle_updater_component_address
    BADGE_NFT_ID             = var.oracle_updater_badge_nft_id
  }
}
