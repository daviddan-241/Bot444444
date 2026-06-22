# ── Danny's Cloud OS — Production Dockerfile ────────────────────────────────
# Multi-stage: build frontend + API server, then minimal runtime image
# Works on: any Docker host, DigitalOcean, Hetzner, home server, Fly.io, etc.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache git python3 py3-pip curl bash

# Install pnpm
RUN npm install -g pnpm@9

WORKDIR /build

# Copy workspace config
COPY pnpm-workspace.yaml package.json ./
COPY pnpm-lock.yaml* ./

# Copy package.json files for all packages (needed for pnpm install)
COPY lib/ lib/
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/nezora/package.json artifacts/nezora/

# Install all deps
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Copy all source
COPY . .

# Build API server (TypeScript → dist/)
RUN pnpm --filter @workspace/api-server run build

# Build frontend (React → dist/)
RUN pnpm --filter @workspace/nezora run build 2>/dev/null || \
    (cd artifacts/nezora && npx vite build)

# Copy built frontend into API server static dir
RUN mkdir -p artifacts/api-server/dist/public && \
    cp -r artifacts/nezora/dist/* artifacts/api-server/dist/public/

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Runtime dependencies for deploying apps
RUN apk add --no-cache \
    git \
    curl \
    wget \
    bash \
    python3 \
    py3-pip \
    php83 \
    php83-cli \
    docker-cli \
    openssh-client

# Install pnpm + serve globally (for static site serving)
RUN npm install -g pnpm@9 serve tsx

WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder /build/artifacts/api-server/dist ./dist
COPY --from=builder /build/artifacts/api-server/node_modules ./node_modules
COPY --from=builder /build/node_modules /app/top_node_modules

# Create persistent data directories
RUN mkdir -p /data/nezora /apps /tmp/cloudos-uploads /tmp/nezora-apps

# ── Environment defaults ──────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=8080
ENV NEZORA_DATA_DIR=/data/nezora
ENV NEZORA_APPS_DIR=/apps

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/healthz || exit 1

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
