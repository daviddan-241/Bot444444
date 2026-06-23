import { EventEmitter } from "events";
import { processManager } from "./process-manager";
import { dockerManager } from "./docker-manager";

export interface WorkerStatus {
  id: string;
  name: string;
  type: string;
  status: "idle" | "running" | "error";
  lastRun?: Date;
  nextRun?: Date;
  runs: number;
  errors: number;
  lastError?: string;
}

interface Worker {
  meta: WorkerStatus;
  interval: number;
  fn: () => Promise<void>;
  timer?: ReturnType<typeof setInterval>;
}

export const workerBus = new EventEmitter();

class WorkerPool {
  private workers = new Map<string, Worker>();
  private healthData: Record<string, { ok: boolean; latency?: number; checkedAt: Date }> = {};
  private metrics: Array<{ ts: number; cpu: number; ram: number }> = [];
  private started = false;

  register(id: string, name: string, type: string, intervalMs: number, fn: () => Promise<void>) {
    if (this.workers.has(id)) return;
    const meta: WorkerStatus = { id, name, type, status: "idle", runs: 0, errors: 0 };
    const worker: Worker = { meta, interval: intervalMs, fn };
    this.workers.set(id, worker);
  }

  startAll() {
    if (this.started) return;
    this.started = true;
    for (const [, w] of this.workers) this._schedule(w);
  }

  private _schedule(w: Worker) {
    const run = async () => {
      w.meta.status = "running";
      w.meta.lastRun = new Date();
      try {
        await w.fn();
        w.meta.runs++;
        w.meta.status = "idle";
      } catch (e) {
        w.meta.errors++;
        w.meta.lastError = e instanceof Error ? e.message : String(e);
        w.meta.status = "error";
      }
      w.meta.nextRun = new Date(Date.now() + w.interval);
    };
    run();
    w.timer = setInterval(run, w.interval);
  }

  list(): WorkerStatus[] {
    return Array.from(this.workers.values()).map(w => ({ ...w.meta }));
  }

  getHealthData() { return this.healthData; }
  getMetrics(last = 60) { return this.metrics.slice(-last); }

  async init() {
    // ── Keep-Alive Pinger: prevents host from sleeping (Render, Replit, Railway)
    this.register("keep-alive", "Keep-Alive Pinger", "system", 4 * 60 * 1000, async () => {
      // Resolve the public base URL in priority order
      const base =
        process.env.ALLOWED_ORIGIN ??                                    // manually set on Render
        process.env.RENDER_EXTERNAL_URL ??                               // set automatically by Render
        (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS}` : null) ??
        process.env.RAILWAY_STATIC_URL ??
        null;
      if (!base) return; // local dev — no need to self-ping
      const url = `${base.replace(/\/$/, "")}/api/ping`;
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`Ping failed: ${r.status}`);
    });

    // ── Health checker: ping every deployed app every 30s ─────────────────────
    this.register("health-checker", "Health Checker", "monitor", 30_000, async () => {
      const procs = processManager.list().filter(p => p.status === "running" && p.port > 0);
      for (const p of procs) {
        const start = Date.now();
        try {
          const r = await fetch(`http://localhost:${p.port}/`, { signal: AbortSignal.timeout(5000) });
          this.healthData[p.id] = { ok: r.ok || r.status < 500, latency: Date.now() - start, checkedAt: new Date() };
        } catch {
          this.healthData[p.id] = { ok: false, checkedAt: new Date() };
          if (p.restarts < 5) {
            processManager.appendLog(p.id, "[HEALTH] Health check failed — triggering restart");
            await processManager.restart(p.id);
          }
        }
      }
      if (dockerManager.available) {
        const containers = dockerManager.list().filter(c => c.status === "running");
        for (const c of containers) {
          const start = Date.now();
          try {
            const r = await fetch(`http://localhost:${c.hostPort}/`, { signal: AbortSignal.timeout(5000) });
            this.healthData[`docker:${c.id}`] = { ok: r.ok || r.status < 500, latency: Date.now() - start, checkedAt: new Date() };
          } catch {
            this.healthData[`docker:${c.id}`] = { ok: false, checkedAt: new Date() };
          }
        }
      }
    });

    // ── Metrics collector: CPU + RAM every 10s ────────────────────────────────
    this.register("metrics-collector", "Metrics Collector", "monitor", 10_000, async () => {
      const { readFile } = await import("fs/promises");
      let cpu = 0;
      try {
        const stat1 = await readFile("/proc/stat", "utf8");
        await new Promise(r => setTimeout(r, 200));
        const stat2 = await readFile("/proc/stat", "utf8");
        const parse = (s: string) => {
          const p = s.split("\n")[0].split(/\s+/).slice(1).map(Number);
          return { idle: p[3], total: p.reduce((a, b) => a + b, 0) };
        };
        const s1 = parse(stat1); const s2 = parse(stat2);
        const dt = s2.total - s1.total; const di = s2.idle - s1.idle;
        cpu = dt > 0 ? Math.round(100 * (1 - di / dt)) : 0;
      } catch { cpu = 0; }

      let ram = 0;
      try {
        const mem = await readFile("/proc/meminfo", "utf8");
        const get = (key: string) => { const m = mem.match(new RegExp(`${key}:\\s+(\\d+)`)); return m ? parseInt(m[1]) : 0; };
        const total = get("MemTotal"); const avail = get("MemAvailable");
        ram = total > 0 ? Math.round(100 * (1 - avail / total)) : 0;
      } catch { ram = 0; }

      this.metrics.push({ ts: Date.now(), cpu, ram });
      if (this.metrics.length > 720) this.metrics.shift();
    });

    // ── Crash Guard: stop infinitely-crashing apps after 5 restarts ──────────
    this.register("crash-guard", "Crash Guard", "repair", 60_000, async () => {
      for (const p of processManager.list()) {
        if (p.status === "crashed" && p.restarts >= 5) {
          processManager.updateStatus(p.id, "stopped");
          processManager.appendLog(p.id, "[CRASH-GUARD] Too many restarts — stopped. Check logs and redeploy.");
          workerBus.emit("crash-guard-stopped", { id: p.id, name: p.name });
        }
      }
    });

    // ── Process Watchdog: telemetry snapshot every 15s ────────────────────────
    this.register("process-watchdog", "Process Watchdog", "monitor", 15_000, async () => {
      const procs = processManager.list();
      const containers = dockerManager.available ? dockerManager.list() : [];
      workerBus.emit("process-snapshot", {
        count: procs.length + containers.length,
        running: procs.filter(p => p.status === "running").length + containers.filter(c => c.status === "running").length,
        crashed: procs.filter(p => p.status === "crashed").length + containers.filter(c => c.status === "crashed").length,
        ts: Date.now(),
      });
    });

    // ── Port Scanner: verify process ports still respond every 60s ────────────
    this.register("port-scanner", "Port Scanner", "monitor", 60_000, async () => {
      const net = await import("net");
      for (const p of processManager.list()) {
        if (p.status !== "running") continue;
        const open = await new Promise<boolean>(resolve => {
          const s = net.createConnection(p.port, "localhost");
          s.once("connect", () => { s.destroy(); resolve(true); });
          s.once("error", () => resolve(false));
          setTimeout(() => { s.destroy(); resolve(false); }, 2000);
        });
        if (!open && p.status === "running") {
          processManager.appendLog(p.id, `[PORT-SCAN] Port ${p.port} not responding — restarting`);
          await processManager.restart(p.id);
        }
      }
    });

    // ── Memory Guard: warn if system RAM > 90% ────────────────────────────────
    this.register("memory-guard", "Memory Guard", "monitor", 30_000, async () => {
      const { readFile } = await import("fs/promises");
      try {
        const mem = await readFile("/proc/meminfo", "utf8");
        const get = (key: string) => { const m = mem.match(new RegExp(`${key}:\\s+(\\d+)`)); return m ? parseInt(m[1]) : 0; };
        const total = get("MemTotal"); const avail = get("MemAvailable");
        const pct = total > 0 ? Math.round(100 * (1 - avail / total)) : 0;
        if (pct > 90) workerBus.emit("memory-warning", { pct, ts: Date.now() });
      } catch {}
    });

    // ── Docker GC: prune stopped containers + dangling images every 6h ────────
    this.register("docker-gc", "Docker GC", "maintenance", 6 * 60 * 60_000, async () => {
      if (!dockerManager.available) return;
      const r1 = await dockerManager.pruneContainers();
      const r2 = await dockerManager.pruneImages();
      workerBus.emit("docker-gc", { containers: r1, images: r2, ts: Date.now() });
    });

    // ── Log Trimmer ───────────────────────────────────────────────────────────
    this.register("log-trimmer", "Log Trimmer", "maintenance", 5 * 60_000, async () => {
      // processManager caps at MAX_LOG_LINES internally; nothing extra to do
    });

    // ── Audit Logger ──────────────────────────────────────────────────────────
    this.register("audit-logger", "Audit Logger", "system", 30_000, async () => {
      // Audit events emitted on workerBus, collected by routes
    });

    this.startAll();
  }
}

export const workerPool = new WorkerPool();
