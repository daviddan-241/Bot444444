import { Router, type IRouter } from "express";
import { timingSafeEqual } from "crypto";

const AUTH_COOKIE = "nezora_admin";

const router: IRouter = Router();

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

router.post("/auth/login", (req, res) => {
  const { token } = req.body;
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    res.status(500).json({ ok: false, message: "ADMIN_TOKEN is not configured." });
    return;
  }
  if (typeof token !== "string" || !safeEqual(token, expected)) {
    res.status(401).json({ ok: false, message: "Invalid token." });
    return;
  }
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 60 * 60 * 24 * 30 * 1000,
  });
  res.json({ ok: true });
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE);
  res.json({ ok: true });
});

router.get("/auth/check", (req, res) => {
  if (!assertAdmin(req, res)) return;
  res.json({ ok: true });
});

export { AUTH_COOKIE };
export default router;
