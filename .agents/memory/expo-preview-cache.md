---
name: Expo Preview Caching
description: The Replit screenshot tool uses the REPLIT_EXPO_DEV_DOMAIN URL for Expo apps, and its browser has a persistent cache that serves stale bundles even after Metro --clear restarts.
---

## Problem
The screenshot tool always navigated to `expo.kirk.replit.dev` which had a persistent browser/CDN cache. Even after:
- Writing new files to disk (verified)
- Running `expo start --clear` (Metro cache cleared)
- Deleting `.expo/` and `node_modules/.cache/`

...the screenshot kept showing the OLD dashboard UI.

## Root cause confirmed
Running `curl localhost:19006/<bundle-url> | grep "MINIMAL\|RED SCREEN"` returned both markers — Metro's bundle DID contain the new code. The screenshot tool's browser cache was stale, not Metro itself.

**Why:** The Expo dev domain preview is cached at the browser/proxy layer. A fresh headless Chrome session should bypass this, but Replit's screenshot tool reuses a profile.

## How to verify code is in the bundle
Instead of relying on screenshots:
```bash
BUNDLE_PATH=$(curl -s http://localhost:19006/ | grep -o 'src="[^"]*entry\.bundle[^"]*"' | sed 's/src="//;s/"//')
curl -s "http://localhost:19006${BUNDLE_PATH}" | grep -o "YOUR_MARKER_TEXT"
```

## TypeScript cast pitfall in useColors.ts
The original scaffold cast `colors as Record<string, typeof colors.light>` — this fails TypeScript because `colors.radius` is a `number`, not a palette object. Always write `useColors` as:
```ts
export function useColors() {
  return { ...colors.dark, radius: colors.radius };
}
```
This TypeScript error (while not a JS runtime error) can confuse debugging — fix it first before investigating bundle serving issues.

## Deploy script
Added `--clear` to `expo start` in `package.json` dev script to always clear Metro cache on restart. Keep this.
