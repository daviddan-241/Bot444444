---
name: Cloud OS backend quirks
description: Key decisions and gotchas for the Danny's Cloud OS backend (api-server)
---

## Express 5 + path-to-regexp v8
Wildcard routes MUST use `{/*param}` syntax, not `*` or `/:param(*)`.

## Export name: saveProject (not saveProjects)
`routes/projects.ts` exports `saveProject` (singular) and `loadProjects` (plural).

## Workers startup
`workerPool.init()` is called in `app.ts` — starts 9 background workers automatically on boot.

## Deploy storage
- Apps stored in `/tmp/nezora-apps/:slug/` (permanent across restarts until /tmp is cleared)
- JSON data in `/tmp/nezora-data/` (projects, domains, databases)
- Static sites served at `/app/:slug/*` via app-proxy route

## Keep-alive
KeepAlive worker pings `/api/healthz` every 4 minutes to prevent Render free tier sleep.

**Why:** Render free tier sleeps after 15 min inactivity; self-ping keeps it alive 24/7.

## ReactNode in Shell.tsx
Must import `import type { ReactNode } from 'react'` and use `ReactNode` directly — not `React.ReactNode` — since there's no default React import in the new JSX transform.

**Why:** TypeScript error "React is not defined" without this fix.
