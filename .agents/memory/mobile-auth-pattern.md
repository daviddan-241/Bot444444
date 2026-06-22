---
name: Mobile Auth Pattern
description: How the mobile app handles auth (custom admin token, not Clerk/Replit Auth)
---

The mobile companion app uses a custom admin token pattern, NOT Clerk or Replit Auth.

**Token storage:** `@react-native-async-storage/async-storage` (already installed in mobile scaffold)
- Server URL key: `cloudos_server_url`
- Admin token key: `cloudos_admin_token`

**How it attaches:** `x-nezora-admin-token` header on every request (matches API server's `auth-guard.ts`).

**Auth flow:** On launch, check AsyncStorage. If either serverUrl or token is missing → show `SetupScreen` (full-screen, not a modal). After save → `isConfigured` becomes true → app renders normally.

**Context:** `contexts/AuthContext.tsx` + `hooks/useApi.ts`

**Why:** API server uses `nezora_admin` cookie OR `x-nezora-admin-token` header. Mobile can't use cookies easily, so header-based auth was chosen.

**How to apply:** Any new screen that calls the API should use `const { get, post, del } = useApi()` from `@/hooks/useApi`. Never hardcode the server URL or token.
