# Build stage
FROM --platform=$BUILDPLATFORM node:22-slim AS builder

RUN corepack enable
WORKDIR /app

# Install build dependencies (slim image needs some extras for pnpm/git if needed, 
# but for simple ts builds it's usually fine)
# RUN apt-get update && apt-get install -y git

# Disable pnpm trust policy to prevent ERR_PNPM_TRUST_DOWNGRADE
ENV PNPM_CONFIG_TRUST_POLICY=none

# Copy the entire services directory
COPY . .

# Install dependencies and build
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Use pnpm deploy to create a standalone production directory
RUN pnpm --filter indexer --prod deploy /app/deployed

# Runtime stage
FROM node:22-slim
WORKDIR /app

# Copy the standalone production bundle
COPY --from=builder /app/deployed ./

# Copy built files
COPY --from=builder /app/containers/indexer/dist ./dist

CMD ["node", "dist/index.js"]
