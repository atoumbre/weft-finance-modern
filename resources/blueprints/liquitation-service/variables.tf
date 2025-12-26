variable "vpc_id" {
  description = "The ID of the VPC where resources will be created"
  type        = string
}

variable "subnet_ids" {
  description = "The IDs of the subnets where ECS tasks will run"
  type        = list(string)
}
