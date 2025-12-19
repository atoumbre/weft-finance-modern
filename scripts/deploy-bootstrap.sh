#!/bin/bash
set -e

echo "=== Weft Finance BOOTSTRAP DEPLOYMENT ==="

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
export_aws_credentials
setup_terraform_env

echo "Target State Bucket: ${STATE_BUCKET}"
echo ""

cd "${PROJECT_ROOT}/terraform/bootstrap"

# Check if we have already configured the backend (backend.tf exists)
if [ -f "backend.tf" ]; then
    echo "✅ Remote backend config found. Initializing..."
    tf_init "bootstrap.tfstate"
else
    echo "⚠️  No backend config found. Checking if we need to migrate..."
    
    # 1. Init Local
    terraform init
    
    # 2. Apply (Creates Bucket if missing)
    echo "Provisioning State Bucket locally..."
    terraform apply -auto-approve
    
    # 3. Create backend config to enforce S3 for future runs
    echo "Creating backend.tf..."
    cat <<EOF > backend.tf
terraform {
  backend "s3" {}
}
EOF
    
    # 4. Migrate Local State -> Remote S3
    echo "Migrating local state to S3..."
    tf_init "bootstrap.tfstate"
fi

# Final Apply to ensure everything is sync
echo "--- Ensuring Bootstrap is up to date ---"
terraform apply -auto-approve

cd "${SCRIPT_DIR}"
echo "✅ Shared Bootstrap infrastructure deployed."
