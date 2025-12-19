#!/bin/bash
set -e

echo "=== Weft Finance ECR DESTRUCTION ==="
echo "⚠️  WARNING: This will DESTROY all ECR repositories."
read -p "Are you sure? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
export_aws_credentials
setup_terraform_env

echo "--- Initializing ECR State ---"
cd "${PROJECT_ROOT}/terraform/ecr"

tf_init "ecr.tfstate"

# Safety Check: Check for images in repositories
REPOS=$(terraform output -json | jq -r 'keys[]' || echo "")
PROTECTED=()

for REPO_URL_OUT in $REPOS; do
    REPO_URL=$(terraform output -raw "$REPO_URL_OUT")
    # Extract repo name from URL (e.g., 123.dkr.ecr.us-east-1.amazonaws.com/weft-indexer -> weft-indexer)
    REPO_NAME=$(echo $REPO_URL | cut -d'/' -f2)
    
    echo "🔍 Checking repository: $REPO_NAME..."
    IMAGE_COUNT=$(aws ecr describe-images --repository-name "$REPO_NAME" --query 'length(imageDetails)' --output text 2>/dev/null || echo "0")
    
    if [ "$IMAGE_COUNT" != "0" ] && [ "$IMAGE_COUNT" != "None" ]; then
        PROTECTED+=("$REPO_NAME ($IMAGE_COUNT images)")
    fi
done

if [ ${#PROTECTED[@]} -ne 0 ]; then
    echo ""
    echo "❌ ABORTING: The following repositories are NOT empty:"
    for P in "${PROTECTED[@]}"; do
        echo "   - $P"
    done
    echo ""
    echo "Please delete the images or use the AWS CLI to force delete the repositories if you are sure."
    exit 1
fi

echo "✅ All repositories are empty. Proceeding with destruction."
terraform destroy -auto-approve

# Cleanup environment workspace
echo "🧹 Cleaning up workspace..."
terraform workspace select default 2>/dev/null || true
# Since ECR usually doesn't use workspaces beyond default, we just clean local files
rm -rf .terraform .terraform.lock.hcl

cd "${SCRIPT_DIR}"
echo "✅ ECR Repositories destroyed."
