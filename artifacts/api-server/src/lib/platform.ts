/**
 * Platform-agnostic public URL detection.
 * Works on: Replit, Render, Railway, Fly.io, Heroku, Vercel, any VPS, localhost.
 * Set PUBLIC_URL env var to override everything else.
 */
export function getPublicUrl(req?: { get?: (h: string) => string | string[] | undefined; protocol?: string }): string {
  const trim = (s: string) => s.replace(/\/+$/, "");

  // ── Explicit override (works on ANY host) ─────────────────────────────────
  if (process.env.PUBLIC_URL) return trim(process.env.PUBLIC_URL);
  if (process.env.APP_URL) return trim(process.env.APP_URL);
  if (process.env.DOMAIN) return `https://${trim(process.env.DOMAIN)}`;

  // ── Render ────────────────────────────────────────────────────────────────
  if (process.env.RENDER_EXTERNAL_URL) return trim(process.env.RENDER_EXTERNAL_URL);

  // ── Railway ───────────────────────────────────────────────────────────────
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  if (process.env.RAILWAY_STATIC_URL) return trim(process.env.RAILWAY_STATIC_URL);

  // ── Fly.io ────────────────────────────────────────────────────────────────
  if (process.env.FLY_APP_NAME) return `https://${process.env.FLY_APP_NAME}.fly.dev`;

  // ── Heroku ────────────────────────────────────────────────────────────────
  if (process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME) return `https://${process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME}`;
  if (process.env.HEROKU_APP_NAME) return `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;

  // ── Vercel ────────────────────────────────────────────────────────────────
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  // ── Replit (dev + deployed) ───────────────────────────────────────────────
  if (process.env.REPLIT_DOMAINS) return `https://${process.env.REPLIT_DOMAINS}`;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;

  // ── Request-derived (reverse-proxy-aware) ─────────────────────────────────
  if (req?.get) {
    const hostRaw = req.get("x-forwarded-host") || req.get("host") || "";
    const host = Array.isArray(hostRaw) ? hostRaw[0] : hostRaw;
    const protoRaw = req.get("x-forwarded-proto") || req.protocol || "http";
    const proto = (Array.isArray(protoRaw) ? protoRaw[0] : protoRaw).split(",")[0].trim();
    if (host) return `${proto}://${host}`;
  }

  // ── Last resort ───────────────────────────────────────────────────────────
  return `http://localhost:${process.env.PORT ?? 8080}`;
}

/** Returns just the hostname for display (no protocol, no trailing slash) */
export function getPublicHost(): string {
  return getPublicUrl().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}
