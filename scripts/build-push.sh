#!/bin/bash
set -e

echo "=== Weft Finance IMAGE BUILD & PUSH ==="

# Source common utilities
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
export_aws_credentials

# Parameter 1: Command or Service
# Valid: indexer, liquidator, get-digest
CMD_OR_SERVICE=$1
# Parameter 2: Tag (optional, default: latest) or Service (if CMD is get-digest)
PARAM_2=${2:-latest}
# Parameter 3: Tag (if CMD is get-digest)
PARAM_3=${3:-latest}

ACCOUNT_ID=$(get_aws_account_id) || exit 1
ECR_PREFIX="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# 1. Digest Retrieval Logic
if [ "$CMD_OR_SERVICE" == "get-digest" ]; then
    SERVICE=$PARAM_2
    TAG=$PARAM_3
    REPO_NAME="weft-${SERVICE}"
    
    DIGEST=$(aws ecr describe-images --repository-name "${REPO_NAME}" --image-ids imageTag=${TAG} --query 'imageDetails[0].imageDigest' --output text 2>/dev/null)
    
    if [ -z "$DIGEST" ] || [ "$DIGEST" == "None" ]; then
        echo "❌ ERROR: Could not find digest for ${REPO_NAME}:${TAG}"
        exit 1
    fi
    
    echo "${DIGEST}"
    
    if [ "$GITHUB_ACTIONS" == "true" ]; then
        echo "${SERVICE}_digest=${DIGEST}" >> $GITHUB_OUTPUT
    fi
    exit 0
fi

# 2. Login to ECR
echo "🔑 Logging into ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_PREFIX}

# Helper function for build/push
build_push() {
    SERVICE=$1
    REPO_NAME="weft-${SERVICE}"
    TAG=${PARAM_2}
    
    echo ""
    echo "📦 [${SERVICE}] Building image (Tag: ${TAG})..."
    cd "${PROJECT_ROOT}/${SERVICE}"
    
    # Ensure dependencies are installed
    if [ -f "pnpm-lock.yaml" ]; then
        corepack enable
        pnpm install
    fi
    
    echo "🔨 Building Docker image ${REPO_NAME}:${TAG} for linux/arm64..."
    # Use Buildx for multi-platform and push directly
    # Standardize tags: push both the specific tag and 'latest'
    docker buildx build \
        --platform linux/arm64 \
        --pull \
        -t ${ECR_PREFIX}/${REPO_NAME}:${TAG} \
        -t ${ECR_PREFIX}/${REPO_NAME}:latest \
        --push .
    
    # Get Digest
    DIGEST=$(aws ecr describe-images --repository-name "${REPO_NAME}" --image-ids imageTag=${TAG} --query 'imageDetails[0].imageDigest' --output text)
    
    echo ""
    echo "--- Results for ${SERVICE} ---"
    echo "✅ Image Built & Pushed (ARM64)."
    echo "🏷️  Tag: ${TAG}"
    echo "🆔 Digest: ${DIGEST}"
    
    # Output for GitHub Actions
    if [ "$GITHUB_ACTIONS" == "true" ]; then
        echo "${SERVICE}_digest=${DIGEST}" >> $GITHUB_OUTPUT
    fi
    
    echo "📋 To use in Terraform, set:"
    echo "   export TF_VAR_${SERVICE}_image_digest=\"${DIGEST}\""
    echo "---------------------------"
    
    cd "${SCRIPT_DIR}"
}

# Run for requested services
if [ -z "$CMD_OR_SERVICE" ] || [ "$CMD_OR_SERVICE" == "indexer" ]; then
    build_push "indexer"
fi

if [ -z "$CMD_OR_SERVICE" ] || [ "$CMD_OR_SERVICE" == "liquidator" ]; then
    build_push "liquidator"
fi

if [ ! -z "$CMD_OR_SERVICE" ] && [ "$CMD_OR_SERVICE" != "indexer" ] && [ "$CMD_OR_SERVICE" != "liquidator" ]; then
    echo "❌ ERROR: Unknown service or command '${CMD_OR_SERVICE}'."
    exit 1
fi

echo ""
echo "✅ Build & Push Complete!"
