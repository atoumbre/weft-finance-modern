#!/bin/bash

# Standardize Profile and Region
export AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_PROFILE="${AWS_PROFILE:-default}"

# Path navigation
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Fix for Terraform AWS Provider v5+ with SSO/Identity Center
# Exports temporary AWS credentials for Terraform if not in GitHub Actions
export_aws_credentials() {
    if [ "$GITHUB_ACTIONS" != "true" ] && command -v aws >/dev/null 2>&1; then
        echo "🔐 Exporting temporary AWS credentials..."
        eval $(aws configure export-credentials --profile "$AWS_PROFILE" --format env 2>/dev/null) \
            || echo "⚠️  Warning: Failed to export credentials via CLI. Continuing with default provider..."
    fi
}

# Get AWS Account ID
get_aws_account_id() {
    local account_id
    account_id=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
    if [ -z "$account_id" ]; then
        echo "❌ ERROR: Could not authenticate with AWS." >&2
        return 1
    fi
    echo "$account_id"
}

# Common Terraform Backend Configuration
setup_terraform_env() {
    ACCOUNT_ID=$(get_aws_account_id) || exit 1
    STATE_BUCKET="weft-terraform-state-${ACCOUNT_ID}"
    DYNAMODB_TABLE="weft-terraform-locks"
}

# Helper for terraform init with remote backend
tf_init() {
    local key=$1
    if [ -z "$key" ]; then
        echo "❌ ERROR: tf_init requires a state key name." >&2
        return 1
    fi

    terraform init -reconfigure \
        -backend-config="bucket=${STATE_BUCKET}" \
        -backend-config="dynamodb_table=${DYNAMODB_TABLE}" \
        -backend-config="key=${key}" \
        -backend-config="region=${AWS_REGION}"
}
