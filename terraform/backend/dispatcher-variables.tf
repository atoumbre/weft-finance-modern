variable "dispatcher_schedule" {
  description = "Schedule expression for dispatcher (e.g. rate(5 minutes))"
  type        = string
}

variable "dispatcher_timeout" {
  description = "Timeout for dispatcher Lambda in seconds"
  type        = number
}

variable "dispatcher_memory" {
  description = "Memory size for dispatcher Lambda in MB"
  type        = number
}

variable "indexer_batch_size" {
  description = "Number of CDPs per batch for indexer"
  type        = number
}

