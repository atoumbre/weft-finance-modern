#!/bin/bash
set -e

ENV=$1
if [ -z "$ENV" ]; then
    echo "Usage: ./destroy-app.sh <environment>"
    echo "Example: ./destroy-app.sh mainnet"
    exit 1
fi

echo "=== Weft Finance Backend DESTRUCTION ==="
echo "Environment: ${ENV}"
echo "⚠️  WARNING: This will DESTROY all backend resources for ${ENV}."
read -p "Are you sure? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
export_aws_credentials
setup_terraform_env

echo "=== Account Validation ==="
echo "AWS Region: ${AWS_REGION}"
echo "Account ID: ${ACCOUNT_ID}"
echo "=========================="

# 1. Initialize Bootstrap to verify access
echo ""
echo "--- Initializing Bootstrap State ---"
cd "${PROJECT_ROOT}/terraform/bootstrap"

# Ensure we have state for bootstrap (local or remote)
if [ -f "backend.tf" ]; then
    tf_init "bootstrap.tfstate" > /dev/null
else
    terraform init > /dev/null
fi

cd "${SCRIPT_DIR}"

if [ -z "$STATE_BUCKET" ]; then
    echo "❌ Error: Could not determine State Bucket name."
    exit 1
fi

echo "State Bucket: ${STATE_BUCKET}"

# 2. Destroy Application Infrastructure
echo ""
echo "--- Destroying Application Infrastructure [${ENV}] ---"
cd "${PROJECT_ROOT}/terraform/backend"

# Connect to Remote State (same as deploy)
tf_init "weft-${ENV}.tfstate"

terraform workspace select ${ENV}

# Empty the data bucket (Terraform cannot delete a non-empty bucket)
# We use 'state show' because 'output' might be missing during partial destruction
DATA_BUCKET=$(terraform state show aws_s3_bucket.main 2>/dev/null | grep "^    id " | awk -F'"' '{print $2}' || echo "")

if [ ! -z "$DATA_BUCKET" ] && [[ "$DATA_BUCKET" == weft-* ]]; then
    echo "🧹 Emptying Data Bucket: ${DATA_BUCKET}..."
    aws s3 rm s3://${DATA_BUCKET} --recursive || echo "⚠️  Warning: Could not empty bucket. It might already be gone or inaccessible."
else
    echo "ℹ️  Note: Data bucket not found in state or already deleted."
fi

terraform destroy -var-file="${ENV}.tfvars" -auto-approve

# Cleanup environment workspace (removes empty state file from S3)
echo "🧹 Cleaning up workspace ${ENV}..."
terraform workspace select default
terraform workspace delete ${ENV}

# Hard Cleanup: Direct S3 removal (backup in case workspace delete leaves files)
echo "🧹 Removing leftover state file from S3..."
aws s3 rm "s3://${STATE_BUCKET}/env:/${ENV}/weft-${ENV}.tfstate" || true

cd "${SCRIPT_DIR}"

echo "✅ Backend Infrastructure for ${ENV} destroyed."
