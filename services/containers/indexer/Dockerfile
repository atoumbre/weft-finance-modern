# Build stage
FROM node:22-alpine AS builder

RUN corepack enable
WORKDIR /app

# Disable pnpm trust policy to prevent ERR_PNPM_TRUST_DOWNGRADE
ENV PNPM_CONFIG_TRUST_POLICY=none

# Copy the entire services directory (build context is 'services')
COPY . .

# Install all dependencies and build everything in the workspace
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Use pnpm deploy to create a standalone production directory
RUN pnpm --filter indexer --prod deploy /app/deployed

# Runtime stage
FROM node:22-alpine
WORKDIR /app

# Copy the standalone production bundle
COPY --from=builder /app/deployed ./

# Copy built files (which are gitignored and thus skipped by pnpm deploy)
COPY --from=builder /app/containers/indexer/dist ./dist

CMD ["node", "dist/index.js"]
