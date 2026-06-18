# Host Nezora Deploy on Render with Docker

This repository includes a production Dockerfile and a Render Blueprint.

## Render setup

1. Push this repo to GitHub.
2. Open https://dashboard.render.com/
3. New > Web Service.
4. Connect the GitHub repo.
5. Runtime: **Docker**.
6. Dockerfile path: `./Dockerfile`.
7. Plan: Free to start.
8. Health check path: `/`.

## Required environment variables

```bash
ADMIN_TOKEN=make-a-long-private-token
ALLOW_SHELL=false
```

Optional:

```bash
NEZORA_BASE_DOMAIN=your-owned-domain.com
RENDER_API_KEY=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
VERCEL_TOKEN=
KOYEB_TOKEN=
NORTHFLANK_TOKEN=
```

## What the Docker image includes

- Node.js 20
- Git
- curl
- unzip
- procps
- iproute2
- dnsutils
- Nezora Next.js production build

This supports the private Linux operations panel and real GitHub ZIP/repo workflows.

## Provider/account reality

Public hosting always requires a real hosting provider account. Nezora includes no-provider-API workflows where possible, such as generating `render.yaml` and opening Render's official deploy flow, but it does not create accounts or bypass provider limits.
