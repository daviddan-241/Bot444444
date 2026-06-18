# Nezora Deploy

A premium, mobile-first multi-cloud deployment platform prototype inspired by Replit Deployments, Coolify, Render and Vercel.

## What is included

- iOS-first Next.js + TypeScript + Tailwind interface.
- Project detection engine for static, React/Vite, Next.js, Vue, Astro, Node/Express, Python Flask/FastAPI and Docker.
- Smart free-provider router.
- Provider adapter interface for Cloudflare, Vercel, Koyeb, Zeabur, Northflank and bot hosts.
- Mock one-tap deploy flow with live logs and HTTPS URL generation.
- Provider Hub, Deployment History, Admin and Settings screens.
- API routes for detection, providers and SSE deployment logs.
- Supabase schema with RLS policies.
- Architecture documentation.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000 on an iPhone-sized viewport.

## Important production note

`nezoradeploy.true` is a configurable base domain. Use a real domain under your control for public DNS and HTTPS, then set `NEZORA_BASE_DOMAIN`.

## Next implementation milestones

1. Add Supabase Auth UI and OAuth callbacks.
2. Implement credential vault encryption.
3. Add direct provider API clients for optional connected providers.
4. Add queue workers and object storage for ZIP uploads.
5. Add Cloudflare DNS wildcard routing and SSL validation.

## Real mode added

Open `/real` after login.

Real working features now included:

- Personal-only lock with `ADMIN_TOKEN`.
- Real GitHub Pages static deployer.
- Real git clone, install, build, publish and GitHub Pages API enable/update.
- Linux operations panel for Render/container troubleshooting.
- Nezora doctor script: `npm run doctor`.

### Render starter settings

- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Environment variables:
  - `ADMIN_TOKEN`: required for personal-only access.
  - `ALLOW_SHELL=false`: recommended. Set `true` only for a private service.
  - `NEZORA_BASE_DOMAIN`: optional real domain base.

### Real free deployment path available today

GitHub Pages works for static projects and exported frontend apps:

- HTML/CSS/JS
- React/Vite
- Vue/Vite
- Astro static
- Next.js only if exportable/static. Nezora can auto-write a static `next.config.mjs` for GitHub Pages when auto-fix is enabled.

APIs, bots and long-running services require real server providers such as Render, Koyeb, Northflank, Fly.io or similar. Programmatic deployment to those providers requires API keys and is not honestly possible without credentials.

## Docker deployment on Render

This repo now includes `Dockerfile`, `.dockerignore`, and `render.yaml` configured for Render's Docker runtime.

On Render:

- Runtime: Docker
- Dockerfile path: `./Dockerfile`
- Health check path: `/`
- Required env var: `ADMIN_TOKEN`
- Recommended env var: `ALLOW_SHELL=false`

See `docs/RENDER_DOCKER.md` and the Settings screen inside the app for all API/key links and exact permissions.

## Simplified deploy flow

The floating plus button opens `/real`, the Deploy Center. From there you can:

- Deploy a real GitHub repository to GitHub Pages.
- Upload a ZIP and deploy it to GitHub Pages.
- Upload a ZIP and prepare a Render Blueprint deploy link for apps, APIs, bots and workers.
- View returned build/publish command logs.
- Run private Linux operation commands inside the Render Docker container.

No generated example projects or pretend provider runs are shown in the UI.

## Sidebar navigation and no-token temporary hosting

The bottom navigation has been replaced with a left sidebar. The plus button in the sidebar opens the Deploy Center.

The Deploy Center now supports an **Instant Temporary URL** target for ZIP uploads. This requires no GitHub token and no provider API key for static/frontend projects. Nezora builds the ZIP inside its Render Docker container and serves it at:

```text
https://YOUR-NEZORA-URL/s/generated-site-slug/
```

This is real hosting on the running Nezora instance, but it is temporary container storage. It can disappear when Render restarts, redeploys, sleeps, or clears the instance. Use GitHub Pages or Render Blueprint for longer-lived public deployments.

Settings now stores your GitHub owner, default branch and GitHub token in your browser so the Deploy Center only needs the repository/project name for GitHub flows.
