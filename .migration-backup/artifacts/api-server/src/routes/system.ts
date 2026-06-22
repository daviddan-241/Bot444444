import { Router, type IRouter } from "express";
import { readFile } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { processManager } from "../lib/process-manager";
import { dockerManager } from "../lib/docker-manager";
import { workerPool } from "../lib/workers";

const exec = promisify(execFile);
const router: IRouter = Router();

async function getCpuPercent(): Promise<number> {
  try {
    const s1 = await readFile("/proc/stat", "utf8");
    await new Promise(r => setTimeout(r, 150));
    const s2 = await readFile("/proc/stat", "utf8");
    const parse = (s: string) => {
      const p = s.split("\n")[0].split(/\s+/).slice(1).map(Number);
      return { idle: p[3], total: p.reduce((a, b) => a + b, 0) };
    };
    const a = parse(s1); const b = parse(s2);
    const dt = b.total - a.total; const di = b.idle - a.idle;
    return dt > 0 ? Math.max(0, Math.round(100 * (1 - di / dt))) : 0;
  } catch { return 0; }
}

async function getMemInfo() {
  try {
    const mem = await readFile("/proc/meminfo", "utf8");
    const get = (key: string) => {
      const m = mem.match(new RegExp(`${key}:\\s+(\\d+)`));
      return m ? parseInt(m[1]) : 0;
    };
    const total = get("MemTotal"); const avail = get("MemAvailable"); const used = total - avail;
    return { totalMb: Math.round(total / 1024), usedMb: Math.round(used / 1024), availMb: Math.round(avail / 1024), percent: total > 0 ? Math.round(100 * used / total) : 0 };
  } catch { return { totalMb: 0, usedMb: 0, availMb: 0, percent: 0 }; }
}

async function getDiskInfo() {
  try {
    const { stdout } = await exec("df", ["-k", "--output=size,used,avail", "/"]);
    const lines = stdout.trim().split("\n");
    if (lines.length < 2) return { totalMb: 0, usedMb: 0, availMb: 0, percent: 0 };
    const [total, used, avail] = lines[1].trim().split(/\s+/).map(Number);
    return { totalMb: Math.round(total / 1024), usedMb: Math.round(used / 1024), availMb: Math.round(avail / 1024), percent: total > 0 ? Math.round(100 * used / total) : 0 };
  } catch { return { totalMb: 0, usedMb: 0, availMb: 0, percent: 0 }; }
}

function getUptime() {
  const s = process.uptime();
  const days = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return {
    seconds: Math.floor(s),
    pretty: days > 0 ? `${days}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`,
  };
}

// ── /api/system/stats ────────────────────────────────────────────────────────
router.get("/system/stats", async (_req, res) => {
  const [cpu, mem, disk] = await Promise.all([getCpuPercent(), getMemInfo(), getDiskInfo()]);
  const procs = processManager.list();
  const containers = dockerManager.list();
  const uptime = getUptime();
  const metrics = workerPool.getMetrics(60);

  res.json({
    ok: true, cpu, mem, disk, uptime,
    processes: {
      total: procs.length,
      running: procs.filter(p => p.status === "running").length,
      crashed: procs.filter(p => p.status === "crashed").length,
      stopped: procs.filter(p => p.status === "stopped").length,
    },
    containers: {
      available: dockerManager.available,
      total: containers.length,
      running: containers.filter(c => c.status === "running").length,
      stopped: containers.filter(c => c.status === "stopped").length,
    },
    workers: {
      total: workerPool.list().length,
      running: workerPool.list().filter(w => w.status === "running").length,
    },
    metrics,
    platform: process.platform,
    nodeVersion: process.version,
  });
});

// ── /api/system/workers ──────────────────────────────────────────────────────
router.get("/system/workers", (_req, res) => {
  res.json({ ok: true, workers: workerPool.list() });
});

// ── /api/system/processes ────────────────────────────────────────────────────
router.get("/system/processes", (_req, res) => {
  res.json({ ok: true, processes: processManager.list() });
});

// ── /api/system/containers ───────────────────────────────────────────────────
router.get("/system/containers", (_req, res) => {
  res.json({ ok: true, available: dockerManager.available, containers: dockerManager.list() });
});

// ── /api/system/metrics ──────────────────────────────────────────────────────
router.get("/system/metrics", (_req, res) => {
  res.json({ ok: true, metrics: workerPool.getMetrics(120) });
});

// ── /api/system/logs ─────────────────────────────────────────────────────────
router.get("/system/logs", async (_req, res) => {
  const procs = processManager.list();
  const logs: { source: string; lines: string[] }[] = [];
  for (const p of procs.slice(0, 20)) {
    logs.push({ source: p.name, lines: processManager.getLogs(p.id, 50) });
  }
  // Also include container logs
  for (const c of dockerManager.list().slice(0, 10)) {
    logs.push({ source: `[docker] ${c.name}`, lines: dockerManager.getLogs(c.id, 30) });
  }
  res.json({ ok: true, logs });
});

// ── /api/system/health ───────────────────────────────────────────────────────
router.get("/system/health", (_req, res) => {
  const health = workerPool.getHealthData();
  res.json({ ok: true, health });
});

// ── /api/system/docker/prune ─────────────────────────────────────────────────
router.post("/system/docker/prune", async (_req, res) => {
  if (!dockerManager.available) { res.json({ ok: false, error: "Docker not available" }); return; }
  const [c, i] = await Promise.all([dockerManager.pruneContainers(), dockerManager.pruneImages()]);
  res.json({ ok: true, containers: c, images: i });
});

export default router;
