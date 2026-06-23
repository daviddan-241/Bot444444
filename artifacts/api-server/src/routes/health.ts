import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { processManager } from "../lib/process-manager";
import { getPublicUrl } from "../lib/platform";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// UptimeRobot-compatible ping — returns 200 as long as server is alive
// Monitor this URL at https://uptimerobot.com every 5 minutes to keep 24/7
router.get("/ping", (req, res) => {
  const mem = process.memoryUsage();
  const procs = processManager.list();
  const running = procs.filter(p => p.status === "running").length;
  const crashed = procs.filter(p => p.status === "crashed").length;

  res.json({
    ok: true,
    status: "alive",
    ts: Date.now(),
    uptime: Math.floor(process.uptime()),
    uptimeHuman: formatUptime(process.uptime()),
    version: "2.0",
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heap: Math.round(mem.heapUsed / 1024 / 1024),
    },
    apps: { running, crashed, total: procs.length },
    publicUrl: getPublicUrl(req),
    host: process.env.RENDER_EXTERNAL_URL
      ? "render"
      : process.env.REPLIT_DOMAINS
        ? "replit"
        : process.env.RAILWAY_PUBLIC_DOMAIN
          ? "railway"
          : "self-hosted",
  });
});

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default router;
