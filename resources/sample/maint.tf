terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6"
    }
  }

  backend "s3" {}
}



resource "aws_instance" "example" {
  ami           = "ami-0720c0a2e1e125edd"
  instance_type = "t4g.micro"

  tags = {
    Name = "HelloWorld"
  }
}

resource "aws_instance" "example1" {
  ami           = "ami-0720c0a2e1e125edd"
  instance_type = "t4g.micro"

  tags = {
    Name = "HelloWorld"
  }
}
