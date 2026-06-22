import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";
import { processManager } from "../lib/process-manager";
import { workerPool } from "../lib/workers";
import { deployQueue } from "../lib/deploy-queue";
import { rm } from "fs/promises";
import path from "path";

const router: IRouter = Router();

const APP_ROOT = process.env.NEZORA_APPS_DIR ?? path.join(process.cwd(), ".nezora-apps");

router.get("/real/processes", (req, res) => {
  if (!assertAdmin(req, res)) return;
  res.json({ ok: true, processes: processManager.list(), workers: deployQueue.workerCount() });
});

router.get("/real/processes/:id", (req, res) => {
  if (!assertAdmin(req, res)) return;
  const proc = processManager.get(req.params.id);
  if (!proc) { res.status(404).json({ ok: false, message: "Not found" }); return; }
  res.json({ ok: true, process: proc });
});

router.get("/real/processes/:id/logs", (req, res) => {
  if (!assertAdmin(req, res)) return;
  const tail = Number(req.query.tail) || 200;
  const logs = processManager.getLogs(req.params.id, tail);
  if (!logs.length && !processManager.get(req.params.id)) {
    res.status(404).json({ ok: false, message: "Not found" }); return;
  }
  res.json({ ok: true, logs });
});

router.post("/real/processes/:id/restart", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const ok = await processManager.restart(req.params.id);
  if (!ok) { res.status(404).json({ ok: false, message: "Process not found" }); return; }
  res.json({ ok: true, message: "Restarting…" });
});

router.delete("/real/processes/:id", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const id = req.params.id;
  const proc = processManager.get(id);
  if (!proc) { res.status(404).json({ ok: false, message: "Not found" }); return; }
  processManager.remove(id);
  const appDir = path.join(APP_ROOT, id);
  try { await rm(appDir, { recursive: true, force: true }); } catch {}
  try {
    const { loadCatalog, saveCatalog } = await import("./app-deploy");
    const cat = await loadCatalog();
    delete cat[id];
    await saveCatalog(cat);
  } catch {}
  res.json({ ok: true, message: `App ${id} stopped and removed.` });
});

router.get("/real/deploy-jobs", (req, res) => {
  if (!assertAdmin(req, res)) return;
  res.json({ ok: true, jobs: deployQueue.list(), workers: deployQueue.workerCount() });
});

router.get("/real/deploy-jobs/:id", (req, res) => {
  if (!assertAdmin(req, res)) return;
  const job = deployQueue.get(req.params.id);
  if (!job) { res.status(404).json({ ok: false, message: "Job not found" }); return; }
  res.json({ ok: true, job });
});

router.get("/real/workers", (_req, res) => {
  res.json({ ok: true, workers: workerPool.list(), queue: deployQueue.workerCount() });
});

export default router;
