# Nezora Deploy production container for Render Docker runtime.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates curl unzip procps iproute2 dnsutils \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates curl unzip procps iproute2 dnsutils \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --shell /bin/bash nezora
COPY --from=builder /app ./
RUN chown -R nezora:nezora /app
USER nezora
EXPOSE 10000
CMD ["npm", "run", "start"]
