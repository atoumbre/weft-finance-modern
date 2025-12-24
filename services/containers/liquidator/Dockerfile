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
RUN pnpm --filter liquidator --prod deploy /app/deployed

# Runtime stage
FROM node:22-alpine
WORKDIR /app

# Copy the standalone production bundle
COPY --from=builder /app/deployed ./
# Copy built files (which are gitignored and thus skipped by pnpm deploy)
COPY --from=builder /app/containers/liquidator/dist ./dist
# Copy common-utils dist (workspace dependency, also gitignored)
COPY --from=builder /app/packages/common-utils/dist ./node_modules/common-utils/dist

CMD ["node", "dist/index.js"]
