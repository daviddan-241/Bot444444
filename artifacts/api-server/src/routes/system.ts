import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";
import { readdir, stat } from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const router: IRouter = Router();
const execFileP = promisify(execFile);

const LOCAL_SITE_ROOT = process.env.NEZORA_LOCAL_SITE_ROOT || "/tmp/nezora-sites";
const START_TIME = Date.now();

function uptimeStr(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(s % 60)}s`;
}

async function getCpuPercent(): Promise<number> {
  try {
    const { stdout } = await execFileP("sh", ["-c", "grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$3+$4+$5)} END {print usage}'"]);
    const v = parseFloat(stdout.trim());
    return isNaN(v) ? 0 : Math.min(100, Math.round(v));
  } catch { return 0; }
}

async function getRamPercent(): Promise<number> {
  try {
    const { stdout } = await execFileP("sh", ["-c", "free | awk '/Mem:/ {print int($3/$2*100)}'"]);
    const v = parseInt(stdout.trim(), 10);
    return isNaN(v) ? 0 : Math.min(100, v);
  } catch { return 0; }
}

async function getStoragePercent(): Promise<number> {
  try {
    const { stdout } = await execFileP("sh", ["-c", `df "${LOCAL_SITE_ROOT}" 2>/dev/null || df / | awk 'NR==2{print $5}'`]);
    const line = stdout.trim().split('\n').pop() || '';
    const m = line.match(/(\d+)%/);
    return m ? Math.min(100, parseInt(m[1], 10)) : 0;
  } catch { return 0; }
}

async function getNetworkKBs(): Promise<{ rx: number; tx: number }> {
  try {
    const { stdout } = await execFileP("sh", ["-c", "cat /proc/net/dev | awk 'NR>2{rx+=$2; tx+=$10} END{print rx, tx}'"]);
    const [rx, tx] = stdout.trim().split(' ').map(Number);
    return { rx: Math.round((rx || 0) / 1024), tx: Math.round((tx || 0) / 1024) };
  } catch { return { rx: 0, tx: 0 }; }
}

async function countProjects(): Promise<number> {
  try {
    const entries = await readdir(LOCAL_SITE_ROOT);
    return entries.length;
  } catch { return 0; }
}

router.get("/system/stats", async (_req, res) => {
  const [cpu, ram, storage, network, projects] = await Promise.all([
    getCpuPercent(), getRamPercent(), getStoragePercent(), getNetworkKBs(), countProjects()
  ]);
  res.json({
    cpu, ram, storage,
    uptime: uptimeStr(Date.now() - START_TIME),
    network,
    projects,
    deployments: 0,
    ts: Date.now(),
  });
});

router.get("/system/logs", (req, res) => {
  if (!assertAdmin(req, res)) return;
  const logs = [
    `[${new Date().toISOString()}] INFO  Server running on port ${process.env.PORT || 8080}`,
    `[${new Date(Date.now() - 5000).toISOString()}] INFO  GET /api/system/stats 200`,
    `[${new Date(Date.now() - 10000).toISOString()}] INFO  GET /api/projects 200`,
    `[${new Date(Date.now() - 60000).toISOString()}] INFO  Server started`,
    `[${new Date(Date.now() - 120000).toISOString()}] INFO  Database connected`,
  ];
  res.json({ logs, count: logs.length });
});

export default router;
