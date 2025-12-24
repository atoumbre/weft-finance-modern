#!/bin/bash

# Terraform Proxy Script
# Usage: ./terraform-proxy.sh <env> [terraform commands...]
# Example: ./terraform-proxy.sh stokenet plan

TARGET=$1

if [ -z "$TARGET" ]; then
  echo "❌ Error: No target environment specified."
  echo "Usage: $0 <shared|stokenet|mainnet> [commands...]"
  exit 1
fi

if [ ! -d "$TARGET" ]; then
  echo "❌ Error: Environment directory '$TARGET' not found."
  exit 1
fi

# Shift arguments to pass the rest to terraform
shift

echo "🚀 Running 'terraform $@' in '$TARGET'..."
terraform -chdir="$TARGET" "$@"
