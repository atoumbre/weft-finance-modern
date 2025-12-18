FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Run
CMD ["node", "dist/index.js"]
