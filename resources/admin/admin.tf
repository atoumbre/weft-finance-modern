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


