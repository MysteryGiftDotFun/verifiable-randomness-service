FROM node:20

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install build dependencies
COPY package.json .
COPY package-lock.json .
COPY tsconfig.json .
RUN npm ci

# Copy source
COPY src ./src
COPY static ./static
COPY CHANGELOG.md .

# Build TypeScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Verify user (security best practice)
# USER node

ENV PORT=3000
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/v1/health || exit 1

# Start the worker
CMD ["node", "dist/index.js"]
