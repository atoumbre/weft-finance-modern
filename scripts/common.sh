#!/bin/bash

# Standardize Profile and Region
export AWS_REGION="${AWS_REGION:-us-east-1}"

# In GitHub Actions, credentials come from environment variables
# Unset AWS_PROFILE to prevent AWS CLI from looking for config files
if [ "$GITHUB_ACTIONS" = "true" ]; then
    unset AWS_PROFILE
else
    export AWS_PROFILE="${AWS_PROFILE:-default}"
fi

# Path navigation - export so available to calling scripts
export SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Fix for Terraform AWS Provider v5+ with SSO/Identity Center
# Exports temporary AWS credentials for Terraform if not in GitHub Actions
export_aws_credentials() {
    # Skip in GitHub Actions - credentials are already in environment
    if [ "$GITHUB_ACTIONS" = "true" ]; then
        return 0
    fi
    
    if command -v aws >/dev/null 2>&1; then
        echo "🔐 Exporting temporary AWS credentials..."
        # Only use --profile if AWS_ACCESS_KEY_ID is not already set
        if [ -z "$AWS_ACCESS_KEY_ID" ]; then
            eval $(aws configure export-credentials --profile "$AWS_PROFILE" --format env 2>/dev/null) \
                || echo "⚠️  Warning: Failed to export credentials via CLI. Continuing with default provider..."
        fi
    fi
}

# Get AWS Account ID
get_aws_account_id() {
    local account_id
    local error_output
    local aws_cmd="aws sts get-caller-identity --query Account --output text"
    
    # In GitHub Actions or when using env vars, don't use --profile
    # The aws-actions/configure-aws-credentials sets AWS_ACCESS_KEY_ID, etc.
    if [ "$GITHUB_ACTIONS" != "true" ] && [ -z "$AWS_ACCESS_KEY_ID" ]; then
        aws_cmd="$aws_cmd --profile $AWS_PROFILE"
    fi
    
    # Capture both stdout and stderr
    error_output=$(eval $aws_cmd 2>&1)
    local exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
        echo "❌ ERROR: Could not authenticate with AWS." >&2
        echo "   AWS CLI Error: $error_output" >&2
        return 1
    fi
    
    account_id="$error_output"
    
    if [ -z "$account_id" ] || [ "$account_id" = "None" ]; then
        echo "❌ ERROR: Could not retrieve AWS Account ID." >&2
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
