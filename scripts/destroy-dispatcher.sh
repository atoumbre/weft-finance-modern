#!/bin/bash
set -e

ENV=$1
if [ -z "$ENV" ]; then
    echo "Usage: ./scripts/destroy-dispatcher.sh <environment>"
    echo "Example: ./scripts/destroy-dispatcher.sh mainnet"
    exit 1
fi

echo "=== Weft Finance DISPATCHER DESTRUCTION ==="
echo "Environment: ${ENV}"
echo "⚠️  WARNING: This will DESTROY the Dispatcher Lambda and его schedule for ${ENV}."
read -p "Are you sure? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
export_aws_credentials
setup_terraform_env

echo "--- Destroying Dispatcher Infrastructure [${ENV}] ---"
cd "${PROJECT_ROOT}/terraform/dispatcher"

# Connect to Remote State (same as deploy)
tf_init "dispatcher-${ENV}.tfstate"

terraform workspace select ${ENV}

# Destroy with shared config and state details
terraform destroy \
    -var-file="../app/${ENV}.tfvars" \
    -var="state_bucket=${STATE_BUCKET}" \
    -var="lock_table=${DYNAMODB_TABLE}" \
    -auto-approve

# Cleanup environment workspace
echo "🧹 Cleaning up workspace ${ENV}..."
terraform workspace select default
terraform workspace delete ${ENV}

# Hard Cleanup: Direct S3 removal
echo "🧹 Removing leftover state file from S3..."
aws s3 rm "s3://${STATE_BUCKET}/env:/${ENV}/dispatcher-${ENV}.tfstate" || true

cd "${SCRIPT_DIR}"

echo "✅ Dispatcher for ${ENV} destroyed."
