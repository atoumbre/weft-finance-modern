FROM node:22-alpine

WORKDIR /app
RUN corepack enable
COPY package.json ./
RUN pnpm install --no-frozen-lockfile --prod

COPY . .
RUN pnpm run build

CMD ["node", "dist/index.js"]
