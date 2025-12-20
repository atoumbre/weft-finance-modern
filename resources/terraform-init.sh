#!/usr/bin/env bash
set -euo pipefail

TF_TARGET="${1:-backend}"
ENVIRONMENT="${2:-}"
if [ "$TF_TARGET" = "backend" ] && [ -z "$ENVIRONMENT" ]; then
  echo "Usage: $(basename "$0") [backend|bootstrap|ecr|observability|logs] [environment]" >&2
  echo "Example: $(basename "$0") backend mainnet" >&2
  echo "Example: $(basename "$0") bootstrap" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="${PROJECT_ROOT}/terraform/${TF_TARGET}"

if [ ! -d "$TF_DIR" ]; then
  echo "Unsupported target: $TF_TARGET" >&2
  exit 1
fi

AWS_REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"

if [ -z "$ACCOUNT_ID" ]; then
  if command -v aws >/dev/null 2>&1; then
    ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
  fi
fi

if [ -z "$ACCOUNT_ID" ] || [ "$ACCOUNT_ID" = "None" ]; then
  echo "AWS account ID not available. Set AWS_ACCOUNT_ID or configure AWS CLI credentials." >&2
  exit 1
fi


if [ -n "$ENVIRONMENT" ]; then
  state_key="${TF_TARGET}-${ENVIRONMENT}.tfstate"
else
  state_key="${TF_TARGET}.tfstate"
fi

terraform -chdir="$TF_DIR" init -reconfigure \
  -backend-config="bucket=weft-terraform-state-${ACCOUNT_ID}" \
  -backend-config="dynamodb_table=weft-terraform-state-locks" \
  -backend-config="key=${state_key}" \
  -backend-config="region=${AWS_REGION}"
