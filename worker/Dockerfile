FROM node:20

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update --allow-insecure-repositories && apt-get install -y --allow-unauthenticated curl jq && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package.json .
COPY tsconfig.json .

# Remove workspace:* deps (not supported by npm), then install deps
RUN npm install

# Copy source
COPY src ./src
COPY static ./static
COPY CHANGELOG.md .

# Build TypeScript
RUN npm run build

# Copy landing-client.js to dist/static/ for landing page (after build creates dist/)
RUN mkdir -p dist/static && cp static/landing-client.js dist/static/ && ls -la dist/

# Remove dev dependencies
RUN npm prune --production

# Create non-root user and set permissions
RUN useradd -m -s /bin/bash appuser && chown -R appuser:appuser /app
USER appuser

ENV PORT=3000
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/v1/health || exit 1

# Start the worker
CMD ["node", "dist/index.js"]
