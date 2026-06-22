# Danny's Cloud OS

A personal private cloud operating system — deploy, monitor, and manage your entire infrastructure from one place. Deploy from Git, ZIP, Docker, or templates. AI assistant for analysis and Dockerfile generation. Real-time monitoring, domain management, databases, storage, and automation.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/nezora run dev` — run the frontend (port 25611)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `GROQ_API_KEY` — Groq free LLM for AI assistant (falls back to HuggingFace then local)
- Optional env: `ADMIN_TOKEN` — Admin auth token (default: any token accepted)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind v4 (artifact: `artifacts/nezora`)
- API: Express 5 (artifact: `artifacts/api-server`)
- DB: PostgreSQL + Drizzle ORM (optional; project/domain/db data stored in `/tmp/nezora-data`)
- Routing: wouter (frontend), Express 5 router (backend)
- AI: Groq API (llama-3.3-70b-versatile) → HuggingFace fallback → local smart responses
- File uploads: `express-fileupload` + `adm-zip`

## Where things live

- `artifacts/nezora/src/pages/` — all 18 pages (Home, Deploy, Projects, AI, Monitoring, Logs, Domains, Databases, Storage, Containers, Templates, Automation, Settings, Providers, Limits, Deployments, Admin, Login)
- `artifacts/nezora/src/components/Shell.tsx` — collapsible sidebar + top bar layout
- `artifacts/nezora/src/index.css` — design tokens (Apple-inspired glassmorphism)
- `artifacts/api-server/src/routes/` — Express routes (system, projects, ai, domains, databases, storage, deploy, auth, limits, shell, static-serve)
- `artifacts/api-server/src/lib/auth-guard.ts` — cookie + header auth middleware

## Architecture decisions

- Control Plane + pluggable Runtime Provider model — platform handles orchestration, provider handles compute
- Express 5 with path-to-regexp v8 requires `{/*path}` wildcard syntax (not `*` or `/:param(*)`)
- Project/domain/database data persisted as JSON in `NEZORA_DATA_DIR` (/tmp/nezora-data by default)
- AI: GROQ_API_KEY → HuggingFace Inference API → local smart responses (no key required to use)
- Auth: `nezora_admin` cookie or `x-nezora-admin-token` header; single-owner mode
- Sidebar is collapsible on desktop, slide-over on mobile

## Product

Danny's Cloud OS is a personal private cloud control plane. You connect your GitHub account, upload ZIPs or paste repo URLs, and the platform auto-detects framework, builds, and deploys. Includes: Deploy Center (Git/ZIP/Docker/Templates), AI Assistant, real-time monitoring with live metrics, projects management, domain + SSL, databases, storage, containers, automation workflows, and a logs viewer.

## User preferences

- Platform name: Danny's Cloud OS (v2)
- AI: use free LLMs (Groq free tier, HuggingFace fallback)
- Self-hosted on Render (no external API dependencies required)
- Mobile-first design, Apple-inspired glassmorphism

## Gotchas

- Express 5 path-to-regexp v8: wildcard routes must use `{/*param}` syntax
- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- `express-fileupload` file is accessed as `req.files?.file` (typed as `UploadedFile`)
- System stats (CPU/RAM) read from /proc/stat and `free` — works on Linux/Replit, not macOS

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
