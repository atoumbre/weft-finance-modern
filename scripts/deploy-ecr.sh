#!/bin/bash
set -e

echo "=== Weft Finance ECR DEPLOYMENT ==="

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
export_aws_credentials
setup_terraform_env

echo "--- Initializing ECR State ---"
cd "${PROJECT_ROOT}/terraform/ecr"

tf_init "ecr.tfstate"

echo "--- Deploying ECR Repositories ---"
terraform apply -auto-approve

cd "${SCRIPT_DIR}"
echo "✅ ECR Repositories deployed."
