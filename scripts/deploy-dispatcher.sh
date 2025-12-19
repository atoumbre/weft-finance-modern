#!/bin/bash
set -e

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
export_aws_credentials

# Configuration
ENV=$1
if [ -z "$ENV" ]; then
    echo "Usage: ./scripts/deploy-dispatcher.sh <environment>"
    echo "Available environments: mainnet, stokenet"
    exit 1
fi

setup_terraform_env

echo "=== Weft Finance DISPATCHER Deployment ==="
echo "Environment: ${ENV}"
echo "=============================="

# Step 1: Bundle Dispatcher (Lambda)
echo ""
echo "--- 1. Bundling Dispatcher Lambda ---"

cd "${PROJECT_ROOT}/dispatcher"
corepack enable
pnpm install
pnpm run bundle
echo "✅ Dispatcher bundled."
cd "${SCRIPT_DIR}"

# Step 2: Deploy Dispatcher Infrastructure
echo ""
echo "--- 2. Deploying Dispatcher [${ENV}] ---"
cd "${PROJECT_ROOT}/terraform/dispatcher"

# Initialize with Remote Backend Config
tf_init "dispatcher-${ENV}.tfstate"

# Select or Create Workspace
terraform workspace select ${ENV} || terraform workspace new ${ENV}

# Apply with specific var file from the backend directory (shared config)
# Also passing the state bucket and lock table for terraform_remote_state lookup
terraform apply \
    -var-file="../backend/${ENV}.tfvars" \
    -var="state_bucket=${STATE_BUCKET}" \
    -var="lock_table=${DYNAMODB_TABLE}" \
    -auto-approve

cd "${SCRIPT_DIR}"

echo ""
echo "✅ Dispatcher Deployment Complete for ${ENV}!"
