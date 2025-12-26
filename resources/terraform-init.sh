#!/usr/bin/env bash
set -euo pipefail

TF_TARGET="${1:-backend}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check if target exists in environments/ or root resources/
if [ -d "${PROJECT_ROOT}/resources/environments/${TF_TARGET}" ]; then
  TF_DIR="${PROJECT_ROOT}/resources/environments/${TF_TARGET}"
elif [ -d "${PROJECT_ROOT}/resources/${TF_TARGET}" ]; then
  TF_DIR="${PROJECT_ROOT}/resources/${TF_TARGET}"
else
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

state_key="${TF_TARGET}.tfstate"

terraform -chdir="$TF_DIR" init -reconfigure \
  -backend-config="bucket=admin-terraform-state-${ACCOUNT_ID}" \
  -backend-config="key=${state_key}" \
  -backend-config="region=${AWS_REGION}" 
