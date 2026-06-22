# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN npm install -g pnpm@9 --silent

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY lib/ ./lib/
COPY artifacts/nezora/package.json ./artifacts/nezora/

RUN pnpm install --frozen-lockfile --filter @workspace/nezora...

COPY artifacts/nezora/ ./artifacts/nezora/

# Accept optional build arg to set the API base URL
ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE

RUN pnpm --filter @workspace/nezora run build

# ── Nginx stage ────────────────────────────────────────────────────────────────
FROM nginx:alpine AS runner

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

COPY --from=builder /workspace/artifacts/nezora/dist /usr/share/nginx/html

# Nginx config: serve SPA + proxy /api to the API container
COPY artifacts/nezora/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s \
  CMD curl -f http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
