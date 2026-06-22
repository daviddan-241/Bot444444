# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN npm install -g pnpm@9 --silent

WORKDIR /workspace

# Copy workspace manifests first (layer-cache friendly)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY lib/ ./lib/
COPY artifacts/api-server/package.json ./artifacts/api-server/

# Install only api-server and its workspace deps
RUN pnpm install --frozen-lockfile --filter @workspace/api-server...

# Copy source
COPY artifacts/api-server/ ./artifacts/api-server/

# Build
RUN pnpm --filter @workspace/api-server run build

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache curl git

WORKDIR /app

# Copy compiled output
COPY --from=builder /workspace/artifacts/api-server/dist ./dist
COPY --from=builder /workspace/artifacts/api-server/package.json ./package.json

# Copy production node_modules
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/artifacts/api-server/node_modules ./node_modules_local 2>/dev/null || true

# Persistent dirs (mount these as Docker volumes)
RUN mkdir -p .nezora-data .nezora-apps .nezora-uploads

EXPOSE 8080
ENV NODE_ENV=production
ENV PORT=8080

HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8080/api/ping || exit 1

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
