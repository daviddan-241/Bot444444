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

// ── SSE: Unified real-time event stream ───────────────────────────────────────
// Named SSE events — EventSource auto-reconnects on disconnect.
// Replaces all client-side polling for process/job/worker state.

router.get("/real/events/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable Nginx/Render/Railway proxy buffering
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  // Full snapshot on connect
  send("init", {
    processes: processManager.list(),
    jobs: deployQueue.list(),
    workers: workerPool.list(),
    queue: deployQueue.workerCount(),
  });

  // Real-time: one event per log line
  const onLog = (payload: { id: string; line: string }) => send("log", payload);

  // Real-time: process status change → push updated process list
  const onStatus = () => send("process", {
    processes: processManager.list(),
    queue: deployQueue.workerCount(),
  });

  processManager.on("log", onLog);
  processManager.on("status", onStatus);
  processManager.on("crash", onStatus);

  // Jobs + workers every 2s (no EventEmitter on queue yet)
  const statePush = setInterval(() => send("state", {
    jobs: deployQueue.list(),
    workers: workerPool.list(),
    queue: deployQueue.workerCount(),
  }), 2000);

  // Heartbeat — stops proxies/load-balancers from killing idle connections
  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch {}
  }, 20000);

  req.on("close", () => {
    clearInterval(statePush);
    clearInterval(heartbeat);
    processManager.off("log", onLog);
    processManager.off("status", onStatus);
    processManager.off("crash", onStatus);
  });
});

// ── SSE: Per-process log tail ─────────────────────────────────────────────────
// Replays last 150 lines then streams new lines in real time.

router.get("/real/processes/:id/logs/stream", (req, res) => {
  const { id } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.flushHeaders();

  for (const line of processManager.getLogs(id, 150)) {
    try { res.write(`data: ${JSON.stringify({ line, replay: true })}\n\n`); } catch {}
  }

  const onLog = ({ id: lid, line }: { id: string; line: string }) => {
    if (lid !== id) return;
    try { res.write(`data: ${JSON.stringify({ line })}\n\n`); } catch {}
  };

  processManager.on("log", onLog);
  const heartbeat = setInterval(() => { try { res.write(": heartbeat\n\n"); } catch {} }, 20000);

  req.on("close", () => {
    clearInterval(heartbeat);
    processManager.off("log", onLog);
  });
});

export default router;
