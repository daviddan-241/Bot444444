import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";
import { readdir, stat, mkdir } from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const router: IRouter = Router();
const execFileP = promisify(execFile);
const STORAGE_ROOT = process.env.NEZORA_STORAGE_ROOT || "/tmp/nezora-storage";

router.get("/storage", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  try {
    await mkdir(STORAGE_ROOT, { recursive: true });
    const entries = await readdir(STORAGE_ROOT, { withFileTypes: true });
    const files = await Promise.all(entries.map(async e => {
      const s = await stat(path.join(STORAGE_ROOT, e.name)).catch(() => null);
      return { name: e.name, type: e.isDirectory() ? 'dir' : 'file', size: s?.size ?? 0, mtime: s?.mtime?.toISOString() };
    }));
    const { stdout } = await execFileP("df", [STORAGE_ROOT]).catch(() => ({ stdout: '' }));
    const line = stdout.split('\n')[1] || '';
    const parts = line.trim().split(/\s+/);
    const used = parseInt(parts[2] || '0', 10) * 1024;
    const total = parseInt(parts[1] || '0', 10) * 1024;
    res.json({ files, usage: { used, total } });
  } catch { res.json({ files: [], usage: { used: 0, total: 0 } }); }
});

router.get("/containers", async (_req, res) => {
  res.json({ containers: [] });
});

export default router;
