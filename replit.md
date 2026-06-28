# Nezora — Real Cloud Deployment Platform

A self-hosted cloud deployment platform that works like Render.com: real git clones, real process management, real build pipelines, real streaming logs, real URL routing, and real persistent storage. Hosted on Replit; Replit acts only as the always-on entry point.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/nezora run dev` — run the frontend (port set by PORT env var)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-server run dev` — build + start API (runs TS compile first)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (optional — platform works without it)
- Optional env: `ADMIN_TOKEN` — set to enable login gate; if unset, platform runs in open mode

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080)
- Frontend: React + Vite (port variable, defaults to 3000; `Frontend` workflow uses 8081)
- DB: PostgreSQL + Drizzle ORM (optional)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/routes/app-deploy.ts` — primary deploy route (`/api/real/app-deploy/git`, `/upload`)
- `artifacts/api-server/src/lib/process-manager.ts` — real `child_process.spawn` with auto-restart
- `artifacts/api-server/src/lib/stack-detector.ts` — auto-detects Node/Python/Go/Rust/Ruby/PHP/Java/Deno/Bun
- `artifacts/api-server/src/lib/deploy-queue.ts` — 4-concurrent-worker async job queue
- `artifacts/api-server/src/lib/workers.ts` — 10 background workers (health checker, crash guard, metrics, etc.)
- `artifacts/api-server/src/routes/app-proxy.ts` — reverse proxy `/app/:slug/*` → deployed app port
- `artifacts/api-server/src/routes/processes.ts` — SSE stream `/api/real/events/stream` for real-time logs
- `artifacts/api-server/src/lib/platform.ts` — Replit/Render/Railway URL auto-detection
- `artifacts/nezora/vite.config.ts` — Vite dev proxy (forwards `/api`, `/app`, `/s` to port 8080)

## Architecture decisions

- **Vite dev proxy**: The frontend Vite dev server proxies `/api`, `/app`, `/s` to `localhost:8080`. This connects the React UI to the Express API in development. Without this, API calls from the browser hit Vite and 404.
- **No Docker required**: `deploy-engine.ts` detects if Docker is available and falls back to native process mode. On Replit, Docker IS available (confirmed).
- **Auth open mode**: If `ADMIN_TOKEN` is not set, `assertAdmin()` returns `true` for all requests — useful for personal self-hosting. Set `ADMIN_TOKEN` to enable the login gate.
- **App persistence**: Deployed apps are cataloged in `.nezora-apps/.catalog.json` and automatically re-spawned on server restart via `restoreApps()` called in `index.ts`.
- **Port range**: Deployed apps get internal ports 3100–3600, assigned by `process-manager.ts`. These are not externally accessible — only reachable via the `/app/:slug/*` proxy route.
- **URL construction**: App URLs are built using `getPublicUrl(req)` from `platform.ts`, which resolves `REPLIT_DOMAINS` → `RENDER_EXTERNAL_URL` → `RAILWAY_*` → request headers. In Replit, deployed apps get URLs like `https://domain.replit.dev/app/slug/`.

## Product

- **Deploy Center**: Paste a GitHub URL or upload a ZIP/tar archive → auto-detects stack → installs, builds, starts → serves at `/app/:slug/`
- **Live Apps**: SSE-powered real-time process monitor showing status, logs, restarts, health
- **Background Workers**: Health checker, crash guard, port scanner, metrics collector, keep-alive pinger, Docker GC
- **Static Sites**: ZIP/tar of static HTML/CSS/JS → served at `/s/:slug/`
- **AI Assistant**: Multi-provider AI chat (OpenRouter, Groq, Together AI) — optional, all env vars optional with graceful fallback

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **Two frontend workflows**: `Frontend` (port 8081) and `artifacts/nezora: web` (dynamic port). Both use the same Vite config with the same proxy. Only one needs to be running.
- **API server must be on port 8080**: The Vite proxy target is hardcoded to `http://localhost:8080`. Override with `VITE_API_PORT` or `API_PORT` env var.
- **Deploy route**: The main deploy path is `app-deploy.ts` (called by the frontend Deploy page). The older `deploy.ts` is a legacy route for ZIP-only deploys without a job queue.
- **SSE CORS**: The SSE stream endpoint sets its own CORS headers. When `REPLIT_DOMAINS` is set, only that domain is allowed as the SSE origin. Requests through the Vite proxy carry the Replit domain as origin, so SSE works correctly.
- **App URL accessibility**: Deployed app URLs (`/app/slug/`) work through either the Express proxy (port 8080) or the Vite proxy chain (8081 → 8080). Both paths are configured.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
