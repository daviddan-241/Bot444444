# Nezora Deploy Architecture

Nezora Deploy is a mobile-first deployment control plane. It does not need to own a large cloud fleet at launch; it securely orchestrates user-connected free providers through adapters.

## Control Plane

- **Next.js app**: mobile UI, API routes, provider OAuth flows, deployment forms.
- **PostgreSQL/Supabase**: users, projects, credentials metadata, deployments, logs and audit events.
- **Redis/Upstash queue**: build and provider orchestration jobs.
- **Workers**: isolated Docker-based workers that clone repositories or unpack ZIPs, detect stack, run safe metadata scans and call provider adapters.
- **WebSocket/SSE**: live build and runtime logs streamed to iOS Safari/Chrome.

## Provider Adapter Contract

Every provider implements:

```ts
interface ProviderAdapter {
  key: ProviderKey;
  label: string;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  deploy(plan: DeploymentPlan): AsyncGenerator<DeployEvent>;
  rollback(deploymentId: string): Promise<{ ok: boolean; message: string }>;
}
```

## Routing Rules

- Static / React / Vite / Vue / Astro -> Cloudflare Pages.
- Next.js -> Vercel Hobby.
- Node/Express and Python APIs -> Koyeb, then Zeabur/Northflank failover.
- Docker/bots -> free bot/container hosts, then Koyeb/Northflank.
- Unknown -> manual override.

## Free Domain System

The string `project-name.nezoradeploy.true` is implemented as a configurable base domain via `NEZORA_BASE_DOMAIN`.

Production note: `.true` is not guaranteed to be a real public TLD. For real HTTPS and DNS, use a domain you own, e.g. `nezoradeploy.com`, then provision `*.nezoradeploy.com` via Cloudflare DNS/proxy and automatic certificates. Free community subdomain services can be offered later, but the most reliable premium experience requires a controlled zone.

## Security Baseline

- OAuth login with GitHub and email magic links.
- Optional 2FA/passkeys.
- Credentials encrypted at rest using envelope encryption.
- RLS policies in Supabase.
- Rate limiting per user, IP and provider.
- Worker sandboxing with CPU/memory/time/network restrictions.
- ZIP bomb protection and malware scans.
- Audit logs for credentials, deployments, rollbacks and admin actions.

## Production Roadmap

1. Add Cloudflare Pages, Vercel and Koyeb API clients when those provider tokens are configured.
2. Add Supabase Auth and credential vault.
3. Add queue workers with Docker isolation.
4. Add DNS reservation service and wildcard certificate automation.
5. Add runtime metrics ingestion and alerting.
6. Add abuse scanning before public URL activation.
