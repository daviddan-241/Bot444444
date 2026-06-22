# ── Danny's Cloud OS — Docker build for Render ─────────────────────────────
FROM node:20-alpine AS base
RUN apk add --no-cache git python3 py3-pip php curl bash

# Install pnpm
RUN npm install -g pnpm@9

WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY lib/ lib/
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/nezora/package.json artifacts/nezora/

# Install all deps
RUN pnpm install --frozen-lockfile || pnpm install

# Copy all source
COPY . .

# Build frontend
RUN pnpm --filter @workspace/nezora run build

# Build API server
RUN pnpm --filter @workspace/api-server run build

# Copy built frontend to API server public dir
RUN mkdir -p artifacts/api-server/dist/public && cp -r artifacts/nezora/dist/* artifacts/api-server/dist/public/

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
RUN apk add --no-cache git python3 py3-pip php curl bash nodejs npm
RUN npm install -g pnpm@9 serve

WORKDIR /app
COPY --from=base /app/artifacts/api-server/dist ./dist
COPY --from=base /app/artifacts/api-server/node_modules ./node_modules
COPY --from=base /app/node_modules /app/node_modules

# Create data dirs
RUN mkdir -p /tmp/nezora-data /tmp/nezora-apps /tmp/nezora-sites /tmp/cloudos-uploads

ENV NODE_ENV=production
ENV PORT=8080
ENV NEZORA_DATA_DIR=/tmp/nezora-data
ENV NEZORA_APPS_DIR=/tmp/nezora-apps

EXPOSE 8080

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
