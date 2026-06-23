import { Request, Response } from "express";
import { timingSafeEqual } from "crypto";

const AUTH_COOKIE = "nezora_admin";

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

export function assertAdmin(req: Request, res: Response): boolean {
  const configured = process.env.ADMIN_TOKEN;
  // If no ADMIN_TOKEN configured → open mode (personal self-hosted tool)
  if (!configured) return true;

  const header = req.headers["x-nezora-admin-token"] || "";
  const cookieHeader = req.headers["cookie"] || "";
  const cookieToken = cookieHeader.toString().match(new RegExp(`${AUTH_COOKIE}=([^;]+)`))?.[1];
  const token = (Array.isArray(header) ? header[0] : header) || cookieToken || "";
  if (!token || !safeEqual(decodeURIComponent(token), configured)) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
    return false;
  }
  return true;
}
