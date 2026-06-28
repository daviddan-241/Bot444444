---
name: Deployed app URL construction and access chain
description: How deployed app URLs are built and how traffic reaches the spawned process.
---

**URL construction**: `getPublicUrl(req)` in `lib/platform.ts` resolves in priority order:
1. `PUBLIC_URL` / `APP_URL` / `DOMAIN` env vars (manual override)
2. `RENDER_EXTERNAL_URL` (Render)
3. `RAILWAY_PUBLIC_DOMAIN` / `RAILWAY_STATIC_URL` (Railway)
4. `FLY_APP_NAME` → `.fly.dev` (Fly.io)
5. `REPLIT_DOMAINS` → `https://${domain}` (Replit)
6. Request `x-forwarded-host` / `host` headers

On Replit, deployed app URL = `https://domain.replit.dev/app/slug/`

**Traffic path** (development):
1. Browser → Replit proxy → Vite dev server (e.g. port 8081)
2. Vite proxy (`/app` rule) → Express API (port 8080)
3. Express `appProxyRouter` regex `/^\/app\/([^/]+)(\/.*)?$/`
4. `proxyToPort(proc.port, req, res, "/app/slug")` → deployed process (port 3100–3600)

**Why:** Apps spawn on internal ports 3100-3600 (not externally accessible). The proxy chain is the only way to reach them.

**Port range**: Configured in `process-manager.ts` as `portBase = 3100`, scanning up to 3600.

**Persistence**: Apps are cataloged in `.nezora-apps/.catalog.json` and restored on server restart via `restoreApps()` in `index.ts`.
