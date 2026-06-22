import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const router: IRouter = Router();
const DATA_DIR = process.env.NEZORA_DATA_DIR || "/tmp/nezora-data";
const DOMAINS_FILE = path.join(DATA_DIR, "domains.json");

async function load(): Promise<any[]> {
  try { return JSON.parse(await readFile(DOMAINS_FILE, "utf8")); } catch { return []; }
}
async function save(data: any[]) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DOMAINS_FILE, JSON.stringify(data, null, 2));
}

router.get("/domains", async (_req, res) => {
  const domains = await load();
  res.json({ domains });
});

router.post("/domains", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { domain, project } = req.body;
  if (!domain) { res.status(400).json({ ok: false, message: "domain required" }); return; }
  const domains = await load();
  domains.push({ id: randomUUID(), domain, project: project || null, ssl: false, createdAt: new Date().toISOString() });
  await save(domains);
  res.json({ ok: true });
});

router.delete("/domains/:id", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const domains = (await load()).filter(d => d.id !== req.params.id);
  await save(domains);
  res.json({ ok: true });
});

export default router;
