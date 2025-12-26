#!/bin/bash

# Terraform Proxy Script
# Usage: ./terraform-proxy.sh <env> [terraform commands...]
# Example: ./terraform-proxy.sh stokenet plan

TARGET=$1

if [ -z "$TARGET" ]; then
  echo "❌ Error: No target environment specified."
  echo "Usage: $0 <global|stokenet|mainnet|bootstrap> [commands...]"
  exit 1
fi

# Resolve actual directory
if [ -d "environments/$TARGET" ]; then
  TARGET_DIR="environments/$TARGET"
elif [ -d "$TARGET" ]; then
  TARGET_DIR="$TARGET"
else
  echo "❌ Error: Environment directory for '$TARGET' not found."
  exit 1
fi

# Shift arguments to pass the rest to terraform
shift

echo "🚀 Running 'terraform $@' in '$TARGET_DIR'..."
terraform -chdir="$TARGET_DIR" "$@"
