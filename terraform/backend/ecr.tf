resource "aws_ecr_repository" "indexer" {
  name = "weft-indexer"
}

resource "aws_ecr_repository" "liquidator" {
  name = "weft-liquidator"
}

