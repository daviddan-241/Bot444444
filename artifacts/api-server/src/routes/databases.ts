import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const router: IRouter = Router();
const DATA_DIR = process.env.NEZORA_DATA_DIR || "/tmp/nezora-data";
const DB_FILE = path.join(DATA_DIR, "databases.json");

async function load(): Promise<any[]> {
  try { return JSON.parse(await readFile(DB_FILE, "utf8")); } catch { return []; }
}
async function save(data: any[]) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

router.get("/databases", async (_req, res) => {
  const databases = await load();
  res.json({ databases });
});

router.post("/databases", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { name, type } = req.body;
  if (!name || !type) { res.status(400).json({ ok: false, message: "name and type required" }); return; }
  const databases = await load();
  databases.push({ id: randomUUID(), name, type, status: "running", size: "0 MB", createdAt: new Date().toISOString() });
  await save(databases);
  res.json({ ok: true });
});

router.delete("/databases/:id", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const databases = (await load()).filter(d => d.id !== req.params.id);
  await save(databases);
  res.json({ ok: true });
});

export default router;
