---
name: Mobile Auth Pattern
description: Mobile companion uses custom admin token auth, not Clerk or Replit Auth
---

**Decision:** Mobile app authenticates with a custom `x-nezora-admin-token` header (same as the web app's auth-guard), NOT Clerk or Replit Auth. Token + server URL are persisted in AsyncStorage and injected on every request.

**Why:** The API server's auth-guard accepts a cookie OR header token. Mobile can't use cookies reliably, so header-based auth was chosen. Users enter their server URL and token on first launch via a setup screen.

**How to apply:** Use `useApi()` hook for all API calls in mobile screens — it automatically injects the token header. Never call `fetch()` directly from mobile screens. If adding new screens that need auth, import from `@/hooks/useApi`.
