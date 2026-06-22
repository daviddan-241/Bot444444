# Nezora Deploy

A mobile-first multi-cloud deployment control panel — deploy projects to Render, GitHub Pages, and other providers via ZIP upload or GitHub repo.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/nezora run dev` — run the frontend (port 25611)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind v4 (artifact: `artifacts/nezora`)
- API: Express 5 (artifact: `artifacts/api-server`)
- DB: PostgreSQL + Drizzle ORM
- Routing: wouter (frontend), Express 5 router (backend)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec at `artifacts/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle for API)
- File uploads: `express-fileupload` + `adm-zip`

## Where things live

- `artifacts/nezora/src/pages/` — all frontend pages (Home, Login, Deploy, Deployments, Providers, Limits, Settings, Admin)
- `artifacts/nezora/src/components/` — Shell layout, PhoneHeader, StatusPill, shadcn/ui components
- `artifacts/nezora/src/index.css` — design tokens (colors: ink, muted, line, cloud; blue=#0A84FF; shadows: soft, glass)
- `artifacts/api-server/src/routes/` — Express routes (auth, providers, limits, deploy, shell, static-serve)
- `artifacts/api-server/src/lib/auth-guard.ts` — cookie-based auth middleware (`nezora_admin` cookie)
- `artifacts/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)

## Architecture decisions

- Migrated from Next.js (v0/Vercel) to Replit pnpm monorepo stack (Vite + Express 5)
- Express 5 with path-to-regexp v8 requires `{/*path}` wildcard syntax (not `*` or `/:param(*)`)
- Auth uses a simple `nezora_admin` cookie; no JWT or session store
- Static site hosting at `/s/:slug{/*path}` serves ZIP-uploaded sites from `LOCAL_SITE_ROOT`
- Tailwind v4 via `@tailwindcss/vite` plugin — no `tailwind.config.js` needed

## Product

Nezora Deploy lets users connect cloud providers (Render, GitHub), upload ZIP archives or connect GitHub repos, and deploy static sites or API services. It includes a deployment history view, provider management, usage limits, settings, and an admin panel.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Express 5 path-to-regexp v8: wildcard routes must use `{/*param}` syntax, not `/*` or `/:param(*)`
- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- `express-fileupload` file is accessed as `req.files?.file` (typed as `UploadedFile`)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
