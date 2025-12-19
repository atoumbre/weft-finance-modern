#!/bin/bash
set -e

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
export_aws_credentials

# Configuration
ENV=$1
if [ -z "$ENV" ]; then
    echo "Usage: ./deploy-app.sh <environment>"
    echo "Available environments: mainnet, stokenet"
    exit 1
fi

setup_terraform_env

echo "=== Weft Finance APP Deployment ==="
echo "Environment: ${ENV}"
echo "AWS Region: ${AWS_REGION}"
echo "Account ID: ${ACCOUNT_ID}"
echo "=============================="

ECR_PREFIX="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Safety Check: Ensure Bootstrap exists
if ! aws s3api head-bucket --bucket "${STATE_BUCKET}" 2>/dev/null; then
    echo "❌ ERROR: Bootstrap infrastructure not found (Bucket ${STATE_BUCKET} missing)."
    echo "   Please run ./deploy-bootstrap.sh first."
    exit 1
fi

# Check for Seed Phrase
if [ -z "$TF_VAR_liquidation_seed_phrase" ]; then
    echo "⚠️  WARNING: TF_VAR_liquidation_seed_phrase is not set."
    echo "   Use: export TF_VAR_liquidation_seed_phrase='your phrase'"
    if [ "$GITHUB_ACTIONS" != "true" ]; then
        read -p "   Or press Enter to continue if you are passing it via a .tfvars file... "
    fi
fi

# Step 1: Verify ECR Images
echo ""
echo "--- 1. Verifying ECR Images ---"
check_image() {
    SERVICE=$1
    REPO_NAME="weft-${SERVICE}"
    echo "🔍 Checking for ${REPO_NAME}:latest..."
    if ! aws ecr describe-images --repository-name "${REPO_NAME}" --image-ids imageTag=latest >/dev/null 2>&1; then
        echo "❌ ERROR: Image ${REPO_NAME}:latest not found in ECR."
        echo "   Please run ./scripts/build-push.sh first."
        exit 1
    fi
}

check_image "indexer"
check_image "liquidator"
echo "✅ All required images found in ECR."

# Step 2: Application Infrastructure - Environment Specific
echo ""
echo "--- 2. Deploying Application Infrastructure [${ENV}] ---"
cd "${PROJECT_ROOT}/terraform/app"

# Initialize with Remote Backend Config
tf_init "weft-${ENV}.tfstate"

# Select or Create Workspace
terraform workspace select ${ENV} || terraform workspace new ${ENV}

# Apply with specific var file
terraform apply -var-file="${ENV}.tfvars" -auto-approve
cd "${SCRIPT_DIR}"

echo ""
echo "✅ App Deployment Complete for ${ENV}!"
