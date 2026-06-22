import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import net from "net";
import path from "path";

export interface ManagedProcess {
  id: string;
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  port: number;
  status: "starting" | "running" | "stopped" | "crashed" | "restarting";
  pid?: number;
  startedAt?: Date;
  stoppedAt?: Date;
  restarts: number;
  logs: string[];
  url?: string;
  framework?: string;
  language?: string;
}

const MAX_LOG_LINES = 500;

class ProcessManager extends EventEmitter {
  private processes = new Map<string, ManagedProcess & { proc?: ChildProcess }>();
  private portBase = 3100;
  private usedPorts = new Set<number>();

  async findFreePort(): Promise<number> {
    for (let p = this.portBase; p < this.portBase + 500; p++) {
      if (this.usedPorts.has(p)) continue;
      const free = await new Promise<boolean>((resolve) => {
        const s = net.createServer();
        s.once("error", () => resolve(false));
        s.once("listening", () => { s.close(); resolve(true); });
        s.listen(p, "0.0.0.0");
      });
      if (free) { this.usedPorts.add(p); return p; }
    }
    throw new Error("No free ports available in range 3100-3600");
  }

  releasePort(port: number) { this.usedPorts.delete(port); }

  async spawn(opts: {
    id: string; name: string; command: string; args?: string[];
    cwd: string; env?: Record<string, string>; port?: number;
    framework?: string; language?: string; url?: string;
  }): Promise<ManagedProcess> {
    if (this.processes.has(opts.id)) await this.kill(opts.id);
    const port = opts.port ?? await this.findFreePort();
    const managed: ManagedProcess & { proc?: ChildProcess } = {
      id: opts.id, name: opts.name, command: opts.command,
      args: opts.args ?? [], cwd: opts.cwd,
      env: { ...process.env as any, PORT: String(port), ...(opts.env ?? {}) },
      port, status: "starting", restarts: 0, logs: [],
      framework: opts.framework, language: opts.language, url: opts.url,
    };
    this.processes.set(opts.id, managed);
    this._start(managed);
    return this._strip(managed);
  }

  private _start(managed: ManagedProcess & { proc?: ChildProcess }) {
    managed.status = "starting";
    managed.startedAt = new Date();
    const proc = spawn(managed.command, managed.args, {
      cwd: managed.cwd, env: managed.env as any,
      shell: true, stdio: ["ignore", "pipe", "pipe"],
    });
    managed.proc = proc;
    managed.pid = proc.pid;

    const setStatus = (s: ManagedProcess["status"]) => {
      managed.status = s;
      this.emit("status", { id: managed.id, status: s });
    };

    const addLog = (line: string) => {
      managed.logs.push(`[${new Date().toISOString()}] ${line}`);
      if (managed.logs.length > MAX_LOG_LINES) managed.logs.shift();
      this.emit("log", { id: managed.id, line });
    };

    setStatus("starting");

    proc.stdout?.on("data", (d) => {
      d.toString().split("\n").filter(Boolean).forEach(addLog);
      if (managed.status === "starting") setStatus("running");
    });
    proc.stderr?.on("data", (d) => {
      d.toString().split("\n").filter(Boolean).forEach((l: string) => addLog(`[ERR] ${l}`));
      if (managed.status === "starting") setStatus("running");
    });

    setTimeout(() => {
      if (managed.status === "starting" && managed.proc?.pid) setStatus("running");
    }, 3000);

    proc.on("exit", (code) => {
      managed.stoppedAt = new Date();
      managed.proc = undefined;
      if (code !== 0 && code !== null && managed.status !== "stopped") {
        setStatus("crashed");
        addLog(`[SYSTEM] Process exited with code ${code}. Scheduling restart...`);
        this.emit("crash", { id: managed.id, code });
        setTimeout(() => {
          if (managed.status === "crashed") {
            managed.restarts++;
            setStatus("restarting");
            this._start(managed);
          }
        }, Math.min(2000 * managed.restarts + 1000, 30000));
      } else {
        setStatus("stopped");
      }
    });
  }

  async kill(id: string): Promise<boolean> {
    const m = this.processes.get(id);
    if (!m) return false;
    m.status = "stopped";
    this.emit("status", { id, status: "stopped" });
    if (m.proc) {
      m.proc.kill("SIGTERM");
      await new Promise(r => setTimeout(r, 500));
      if (m.proc?.pid) m.proc.kill("SIGKILL");
      m.proc = undefined;
    }
    this.releasePort(m.port);
    return true;
  }

  async restart(id: string): Promise<boolean> {
    const m = this.processes.get(id);
    if (!m) return false;
    if (m.proc) { m.proc.kill("SIGTERM"); m.proc = undefined; }
    m.status = "restarting";
    this.emit("status", { id, status: "restarting" });
    m.restarts++;
    await new Promise(r => setTimeout(r, 500));
    this._start(m);
    return true;
  }

  remove(id: string) {
    const m = this.processes.get(id);
    if (m?.proc) m.proc.kill("SIGKILL");
    if (m) this.releasePort(m.port);
    this.processes.delete(id);
  }

  get(id: string): ManagedProcess | undefined {
    const m = this.processes.get(id);
    return m ? this._strip(m) : undefined;
  }

  list(): ManagedProcess[] {
    return Array.from(this.processes.values()).map(this._strip);
  }

  getLogs(id: string, tail = 100): string[] {
    return (this.processes.get(id)?.logs ?? []).slice(-tail);
  }

  appendLog(id: string, line: string) {
    const m = this.processes.get(id);
    if (!m) return;
    m.logs.push(`[${new Date().toISOString()}] ${line}`);
    if (m.logs.length > MAX_LOG_LINES) m.logs.shift();
  }

  updateStatus(id: string, status: ManagedProcess["status"]) {
    const m = this.processes.get(id);
    if (m) { m.status = status; this.emit("status", { id, status }); }
  }

  updateUrl(id: string, url: string) {
    const m = this.processes.get(id);
    if (m) m.url = url;
  }

  private _strip(m: ManagedProcess & { proc?: ChildProcess }): ManagedProcess {
    const { proc: _, ...rest } = m as any;
    return rest;
  }
}

export const processManager = new ProcessManager();
