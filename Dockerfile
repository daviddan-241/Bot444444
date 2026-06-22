# ══════════════════════════════════════════════════════════════════════════════
# Nezora — single-container build (works on Render, Railway, Fly.io, any VPS)
# One image serves both the web dashboard (static) and the API (/api routes).
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Build web dashboard ──────────────────────────────────────────────
FROM node:20-alpine AS web-builder
RUN npm install -g pnpm@10 --silent

WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY lib/ ./lib/
COPY artifacts/nezora/package.json ./artifacts/nezora/

RUN pnpm install --frozen-lockfile --filter @workspace/nezora...

COPY artifacts/nezora/ ./artifacts/nezora/

# Build Vite app at base path "/" (served by Express in production)
ENV NODE_ENV=production BASE_PATH=/ PORT=3000
RUN pnpm --filter @workspace/nezora run build
# Output: artifacts/nezora/dist/public/

# ── Stage 2: Build API server ─────────────────────────────────────────────────
FROM node:20-alpine AS api-builder
RUN npm install -g pnpm@10 --silent

WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY lib/ ./lib/
COPY artifacts/api-server/package.json ./artifacts/api-server/

RUN pnpm install --frozen-lockfile --filter @workspace/api-server...

COPY artifacts/api-server/ ./artifacts/api-server/

RUN pnpm --filter @workspace/api-server run build
# Output: artifacts/api-server/dist/

# ── Stage 3: Production runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache curl git

WORKDIR /app

# API server compiled output
COPY --from=api-builder /workspace/artifacts/api-server/dist ./dist
COPY --from=api-builder /workspace/artifacts/api-server/package.json ./package.json

# node_modules (api-server deps + workspace shared deps)
COPY --from=api-builder /workspace/node_modules ./node_modules

# Web dashboard — copied into ./public so Express static-serves it
COPY --from=web-builder /workspace/artifacts/nezora/dist/public ./public

# Persistent data dirs (mount as volumes to survive redeploys)
RUN mkdir -p .nezora-data .nezora-apps .nezora-uploads

EXPOSE 10000
ENV NODE_ENV=production
# Render assigns PORT dynamically; default 10000 for local docker run
ENV PORT=10000

HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/ping || exit 1

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
