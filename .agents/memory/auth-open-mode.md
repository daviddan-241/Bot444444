---
name: Auth open mode behavior
description: When ADMIN_TOKEN env var is not set, the platform runs in fully open mode — no login required.
---

`assertAdmin()` in `auth-guard.ts` checks `process.env.ADMIN_TOKEN`. If it's not configured, it returns `true` immediately — all protected endpoints are accessible without any token or cookie.

**Why:** Personal self-hosting tool — one owner, no need for auth unless deliberately configured.

**How to apply:** To enable the login gate, set `ADMIN_TOKEN=some-secret` in env vars. The Login page will then require that token. Without it, the `GET /api/auth/check` endpoint returns `{"ok":true}` and the frontend skips the login page entirely.
