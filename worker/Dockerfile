FROM node:24.21.0-bookworm-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl jq && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package.json package-lock.json tsconfig.json ./
COPY patches ./patches

# Pack local file dependencies into node_modules so pruning dev dependencies
# cannot remove the production bigint-buffer compatibility package.
RUN npm ci --install-links=true

# Copy source
COPY src ./src
COPY static ./static
COPY CHANGELOG.md .

# Build TypeScript
RUN npm run build

# Copy inlined landing scripts to dist/static/ for landing page (after build creates dist/)
RUN mkdir -p dist/static && cp static/*.js dist/static/ && ls -la dist/

# Remove dev dependencies
RUN npm prune --omit=dev --install-links=true \
  && node --input-type=module -e "await import('bigint-buffer')"

# Create non-root runtime user. The app only needs read access to /app,
# so avoid a recursive chown layer that makes every image push very large.
RUN useradd -m -s /bin/bash appuser
USER appuser

ENV NODE_ENV=production APP_ENVIRONMENT=production ENVIRONMENT=production PORT=3000
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/v1/health || exit 1

# Start the worker
CMD ["node", "dist/index.js"]
