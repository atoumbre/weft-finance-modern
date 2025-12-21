FROM node:22-alpine

WORKDIR /app
RUN corepack enable
COPY package.json ./
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm run build
RUN CI=true pnpm prune --prod

CMD ["node", "dist/index.js"]
