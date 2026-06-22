import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/ping", (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    ok: true,
    ts: Date.now(),
    uptime: Math.floor(process.uptime()),
    version: "2.0",
    memory: { rss: Math.round(mem.rss / 1024 / 1024), heap: Math.round(mem.heapUsed / 1024 / 1024) },
    domain: process.env.REPLIT_DOMAINS ?? "localhost",
  });
});

export default router;
