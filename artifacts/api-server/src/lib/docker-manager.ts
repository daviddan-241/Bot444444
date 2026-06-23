import { spawn, execFile } from "child_process";
import { promisify } from "util";
import { EventEmitter } from "events";
import path from "path";
import { mkdir, writeFile } from "fs/promises";

const execP = promisify(execFile);

export interface DockerApp {
  id: string;
  name: string;
  containerId?: string;
  image?: string;
  port: number;
  hostPort: number;
  status: "building" | "starting" | "running" | "stopped" | "crashed" | "restarting";
  restarts: number;
  logs: string[];
  startedAt?: Date;
  stoppedAt?: Date;
  cpuPercent?: number;
  memMb?: number;
  framework?: string;
  language?: string;
  appDir: string;
  volumePath?: string;
  env: Record<string, string>;
}

const MAX_LOG_LINES = 1000;
const APPS_DIR = process.env.NEZORA_APPS_DIR ?? "/tmp/nezora-apps";
const DATA_DIR = process.env.NEZORA_DATA_DIR ?? "/tmp/nezora-data";

export const isDockerAvailable = async (): Promise<boolean> => {
  try {
    await execP("docker", ["info"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

class DockerManager extends EventEmitter {
  private apps = new Map<string, DockerApp>();
  private portBase = 4000;
  private usedPorts = new Set<number>();
  private _dockerAvailable: boolean | null = null;

  async init() {
    this._dockerAvailable = await isDockerAvailable();
    if (this._dockerAvailable) {
      console.log("[Docker] Docker available — container mode enabled");
      await this._syncRunningContainers();
      this._startStatsLoop();
    } else {
      console.log("[Docker] Docker not available — process mode only");
    }
    return this._dockerAvailable;
  }

  get available() { return this._dockerAvailable ?? false; }

  async allocatePort(): Promise<number> {
    for (let p = this.portBase; p < this.portBase + 2000; p++) {
      if (!this.usedPorts.has(p)) { this.usedPorts.add(p); return p; }
    }
    throw new Error("No free ports in range 4000-6000");
  }

  releasePort(p: number) { this.usedPorts.delete(p); }

  // ── Build + Run ────────────────────────────────────────────────────────────
  async deployApp(opts: {
    id: string;
    name: string;
    appDir: string;
    port?: number;
    env?: Record<string, string>;
    framework?: string;
    language?: string;
    restartPolicy?: "always" | "unless-stopped" | "on-failure" | "no";
    memLimit?: string;   // e.g. "512m", "2g"
    cpuLimit?: string;   // e.g. "1.5"
    volumeMounts?: string[]; // "host:container"
  }): Promise<DockerApp> {
    const hostPort = opts.port ?? await this.allocatePort();
    const containerPort = 3000;
    const containerName = `cloudos-${opts.id}`;
    const imageName = `cloudos-app-${opts.id}`;

    const app: DockerApp = {
      id: opts.id,
      name: opts.name,
      port: containerPort,
      hostPort,
      status: "building",
      restarts: 0,
      logs: [],
      appDir: opts.appDir,
      env: { PORT: String(containerPort), NODE_ENV: "production", ...(opts.env ?? {}) },
      framework: opts.framework,
      language: opts.language,
      volumePath: path.join(DATA_DIR, "volumes", opts.id),
    };
    this.apps.set(opts.id, app);
    this.emit("update", app);

    const log = (line: string) => {
      app.logs.push(`[${new Date().toISOString()}] ${line}`);
      if (app.logs.length > MAX_LOG_LINES) app.logs.shift();
      this.emit("log", { id: opts.id, line });
    };

    try {
      // Ensure volume dir
      await mkdir(app.volumePath!, { recursive: true });

      // Stop + remove old container if exists
      await this._exec("docker", ["rm", "-f", containerName]).catch(() => null);
      await this._exec("docker", ["rmi", "-f", imageName]).catch(() => null);

      // Build image
      log(`[BUILD] Building Docker image ${imageName}...`);
      app.status = "building";
      const buildArgs = ["build", "-t", imageName, "."];
      // Use Dockerfile.cloudos if exists, otherwise default Dockerfile
      const dfPath = path.join(opts.appDir, "Dockerfile.cloudos");
      const dfDefault = path.join(opts.appDir, "Dockerfile");
      try {
        await execP("test", ["-f", dfPath]);
        buildArgs.splice(1, 0, "-f", "Dockerfile.cloudos");
      } catch {
        try { await execP("test", ["-f", dfDefault]); } catch {
          // Write a default Dockerfile
          await this._writeDefaultDockerfile(opts.appDir, opts.framework, opts.language);
        }
      }
      const buildResult = await this._streamExec("docker", buildArgs, opts.appDir, log);
      if (buildResult !== 0) {
        app.status = "crashed";
        log(`[BUILD] Failed with exit code ${buildResult}`);
        this.emit("update", app);
        return app;
      }
      log(`[BUILD] Image built successfully`);

      // Run container
      app.status = "starting";
      const runArgs = [
        "run", "-d",
        "--name", containerName,
        "--restart", opts.restartPolicy ?? "unless-stopped",
        "-p", `${hostPort}:${containerPort}`,
        "-v", `${app.volumePath}:/data`,
        "--label", `cloudos.id=${opts.id}`,
        "--label", `cloudos.name=${opts.name}`,
      ];

      // Resource limits
      if (opts.memLimit) runArgs.push("--memory", opts.memLimit);
      if (opts.cpuLimit) runArgs.push("--cpus", opts.cpuLimit);

      // Extra volume mounts
      (opts.volumeMounts ?? []).forEach(v => { runArgs.push("-v", v); });

      // Env vars
      for (const [k, v] of Object.entries(app.env)) {
        runArgs.push("-e", `${k}=${v}`);
      }

      runArgs.push(imageName);

      const { stdout } = await execP("docker", runArgs, { cwd: opts.appDir });
      app.containerId = stdout.trim().slice(0, 12);
      app.startedAt = new Date();
      app.status = "running";
      log(`[RUN] Container started: ${app.containerId} on port ${hostPort}`);
      this.emit("update", app);

      // Attach log streaming
      this._streamLogs(app, log);

    } catch (err: any) {
      app.status = "crashed";
      log(`[ERROR] ${err.message}`);
      this.emit("update", app);
    }

    return app;
  }

  // ── Control ────────────────────────────────────────────────────────────────
  async stopApp(id: string): Promise<boolean> {
    const app = this.apps.get(id);
    if (!app) return false;
    const name = `cloudos-${id}`;
    await this._exec("docker", ["stop", name]).catch(() => null);
    app.status = "stopped";
    app.stoppedAt = new Date();
    this.emit("update", app);
    return true;
  }

  async startApp(id: string): Promise<boolean> {
    const app = this.apps.get(id);
    if (!app) return false;
    const name = `cloudos-${id}`;
    await this._exec("docker", ["start", name]);
    app.status = "running";
    app.startedAt = new Date();
    this.emit("update", app);
    this._streamLogs(app, (line) => {
      app.logs.push(`[${new Date().toISOString()}] ${line}`);
      if (app.logs.length > MAX_LOG_LINES) app.logs.shift();
    });
    return true;
  }

  async restartApp(id: string): Promise<boolean> {
    const app = this.apps.get(id);
    if (!app) return false;
    const name = `cloudos-${id}`;
    await this._exec("docker", ["restart", name]);
    app.status = "running";
    app.restarts++;
    this.emit("update", app);
    return true;
  }

  async removeApp(id: string): Promise<boolean> {
    const app = this.apps.get(id);
    if (!app) return false;
    const name = `cloudos-${id}`;
    const image = `cloudos-app-${id}`;
    await this._exec("docker", ["rm", "-f", name]).catch(() => null);
    await this._exec("docker", ["rmi", "-f", image]).catch(() => null);
    this.releasePort(app.hostPort);
    this.apps.delete(id);
    this.emit("removed", { id });
    return true;
  }

  // ── Inspect ────────────────────────────────────────────────────────────────
  get(id: string): DockerApp | undefined { return this.apps.get(id); }
  list(): DockerApp[] { return Array.from(this.apps.values()); }
  getLogs(id: string, tail = 200): string[] { return (this.apps.get(id)?.logs ?? []).slice(-tail); }

  async getContainerStats(id: string): Promise<{ cpu: number; memMb: number } | null> {
    const app = this.apps.get(id);
    if (!app?.containerId) return null;
    try {
      const { stdout } = await execP("docker", [
        "stats", "--no-stream", "--format",
        "{{.CPUPerc}}\t{{.MemUsage}}",
        `cloudos-${id}`
      ]);
      const [cpuStr, memStr] = stdout.trim().split("\t");
      const cpu = parseFloat(cpuStr.replace("%", ""));
      const memMatch = memStr.match(/^([\d.]+)([kKmMgG]i?B)/);
      let memMb = 0;
      if (memMatch) {
        const val = parseFloat(memMatch[1]);
        const unit = memMatch[2].toLowerCase();
        memMb = unit.startsWith("g") ? val * 1024 : unit.startsWith("k") ? val / 1024 : val;
      }
      return { cpu, memMb };
    } catch { return null; }
  }

  // ── System ─────────────────────────────────────────────────────────────────
  async pruneContainers(): Promise<string> {
    try {
      const { stdout } = await execP("docker", ["container", "prune", "-f"]);
      return stdout.trim();
    } catch { return "prune skipped"; }
  }

  async pruneImages(): Promise<string> {
    try {
      const { stdout } = await execP("docker", ["image", "prune", "-f"]);
      return stdout.trim();
    } catch { return "prune skipped"; }
  }

  async listAllContainers(): Promise<Array<{ id: string; name: string; status: string; image: string }>> {
    try {
      const { stdout } = await execP("docker", [
        "ps", "-a", "--filter", "label=cloudos.id",
        "--format", "{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}"
      ]);
      return stdout.trim().split("\n").filter(Boolean).map(line => {
        const [id, name, status, image] = line.split("\t");
        return { id, name, status, image };
      });
    } catch { return []; }
  }

  // ── Internals ──────────────────────────────────────────────────────────────
  private async _syncRunningContainers() {
    const containers = await this.listAllContainers();
    for (const c of containers) {
      const match = c.name.match(/^cloudos-(.+)$/);
      if (!match) continue;
      const id = match[1];
      if (this.apps.has(id)) continue;
      // Re-attach from running container
      const resolvedPort = await this._parseHostPort(c.id);
      const hostPort = resolvedPort ?? (await this.allocatePort()) ?? 0;
      const app: DockerApp = {
        id,
        name: c.name.replace("cloudos-", ""),
        containerId: c.id,
        status: c.status.startsWith("Up") ? "running" : "stopped",
        restarts: 0,
        logs: [],
        port: 3000,
        hostPort,
        appDir: path.join(APPS_DIR, id),
        env: {},
      };
      if (hostPort) this.usedPorts.add(hostPort);
      this.apps.set(id, app);
    }
  }

  private async _parseHostPort(containerId: string): Promise<number | null> {
    try {
      const { stdout } = await execP("docker", [
        "inspect", "--format", "{{json .NetworkSettings.Ports}}", containerId
      ]);
      const ports = JSON.parse(stdout);
      for (const bindings of Object.values(ports) as any[]) {
        if (bindings?.[0]?.HostPort) return parseInt(bindings[0].HostPort);
      }
    } catch {}
    return null;
  }

  private _streamLogs(app: DockerApp, log: (l: string) => void) {
    const name = `cloudos-${app.id}`;
    const proc = spawn("docker", ["logs", "-f", "--tail", "50", name], { stdio: ["ignore", "pipe", "pipe"] });
    proc.stdout?.on("data", (d: Buffer) => d.toString().split("\n").filter(Boolean).forEach(log));
    proc.stderr?.on("data", (d: Buffer) => d.toString().split("\n").filter(Boolean).forEach(l => log(`[ERR] ${l}`)));
    proc.on("exit", (code) => {
      if (app.status === "running" && code !== 0) {
        app.status = "crashed";
        this.emit("update", app);
      }
    });
  }

  private _startStatsLoop() {
    setInterval(async () => {
      for (const app of this.apps.values()) {
        if (app.status !== "running") continue;
        const stats = await this.getContainerStats(app.id);
        if (stats) { app.cpuPercent = stats.cpu; app.memMb = stats.memMb; }
      }
    }, 30000);
  }

  private async _exec(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execP(cmd, args, { timeout: 30000 });
  }

  private _streamExec(cmd: string, args: string[], cwd: string, log: (l: string) => void): Promise<number> {
    return new Promise(resolve => {
      const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
      proc.stdout?.on("data", (d: Buffer) => d.toString().split("\n").filter(Boolean).forEach(log));
      proc.stderr?.on("data", (d: Buffer) => d.toString().split("\n").filter(Boolean).forEach(l => log(`[ERR] ${l}`)));
      proc.on("exit", code => resolve(code ?? 1));
    });
  }

  private async _writeDefaultDockerfile(appDir: string, framework?: string, language?: string) {
    let content = "";
    if (language === "python") {
      content = `FROM python:3.11-slim\nWORKDIR /app\nCOPY requirements.txt* ./\nRUN pip install -r requirements.txt --no-cache-dir 2>/dev/null || true\nCOPY . .\nEXPOSE 3000\nCMD ["python", "app.py"]`;
    } else if (language === "php") {
      content = `FROM php:8.2-apache\nCOPY . /var/www/html/\nEXPOSE 80\n`;
    } else {
      content = `FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install --production\nCOPY . .\nEXPOSE 3000\nCMD ["node", "index.js"]`;
    }
    await writeFile(path.join(appDir, "Dockerfile"), content);
  }
}

export const dockerManager = new DockerManager();
