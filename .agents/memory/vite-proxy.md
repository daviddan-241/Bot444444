---
name: Vite proxy for API connectivity
description: The Vite dev frontend must proxy /api, /app, /s to the Express API (port 8080), otherwise all fetch() calls from React hit Vite and 404.
---

The Express API runs on port 8080. The Vite frontend dev server runs on a separate port (8081 for the `Frontend` workflow, dynamic for `artifacts/nezora: web`). Without `server.proxy` in `vite.config.ts`, every `fetch('/api/...')` from the React app hits Vite and gets a 404.

**Fix applied**: Added `server.proxy` in `artifacts/nezora/vite.config.ts`:
```
proxy: {
  "/api": { target: "http://localhost:8080", changeOrigin: true, configure: ... },  // SSE-aware
  "/app": { target: "http://localhost:8080", changeOrigin: true, ws: true },
  "/s":   { target: "http://localhost:8080", changeOrigin: true },
}
```

**Why:** The frontend and API are separate processes in development. The proxy is the bridge.

**How to apply:** Any time the Vite frontend is separate from the Express API, this proxy config is required. Override API port with `VITE_API_PORT` or `API_PORT` env var.
