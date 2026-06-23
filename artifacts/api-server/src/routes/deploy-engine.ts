import { Router, type IRouter, type Request, type Response } from "express";
import { type UploadedFile } from "express-fileupload";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, rm, mkdir, cp, readdir, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import AdmZip from "adm-zip";
import { detectStack, generateDockerfile } from "../lib/stack-detector";
import { processManager } from "../lib/process-manager";
import { dockerManager } from "../lib/docker-manager";
import { analyzeAndRepair } from "../lib/repair-engine";
import { assertAdmin } from "../lib/auth-guard";
import { loadProjects, saveProject } from "./projects";

const execP = promisify(execFile);
const router: IRouter = Router();

const APPS_DIR = process.env.NEZORA_APPS_DIR ?? "/tmp/nezora-apps";

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `app-${Date.now()}`;
}

function getBaseUrl(req: Request, appSlug: string): string {
  // Self-hosted: use ALLOWED_ORIGIN or derive from request host
  const origin = process.env.ALLOWED_ORIGIN;
  if (origin) return `${origin}/app/${appSlug}`;
  const replit = process.env.REPLIT_DEV_DOMAIN;
  if (replit) return `https://${replit}/app/${appSlug}`;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:8080";
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  return `${proto}://${host}/app/${appSlug}`;
}

async function run(cmd: string, args: string[], cwd: string, env?: Record<string, string>): Promise<{ code: number; output: string }> {
  return new Promise(resolve => {
    const proc = execFile(cmd, args, {
      cwd,
      env: { ...process.env, ...(env ?? {}) } as any,
      maxBuffer: 50 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join("\n");
      resolve({ code: err ? (err as any).code ?? 1 : 0, output });
    });
    proc.stdout?.pipe(process.stdout);
    proc.stderr?.pipe(process.stderr);
  });
}

async function deployFromDir(
  dir: string,
  req: Request,
  name: string,
  source: string,
  opts?: { mode?: "process" | "docker"; memLimit?: string; cpuLimit?: string; restartPolicy?: string },
): Promise<{ ok: boolean; url?: string; logs: string[]; stack: any; error?: string }> {
  const logs: string[] = [];
  const log = (msg: string) => { logs.push(msg); console.log(msg); };

  log(`[DEPLOY] Detecting stack in ${dir}...`);
  const stack = await detectStack(dir);
  log(`[DETECT] Stack: ${stack.language}/${stack.framework} — ${stack.detected.join(", ")}`);

  const appSlug = slug(name);
  const appDir = path.join(APPS_DIR, appSlug);
  await mkdir(appDir, { recursive: true });

  // Write Dockerfile if missing
  if (!stack.dockerfile) {
    const df = generateDockerfile(stack);
    await writeFile(path.join(dir, "Dockerfile.cloudos"), df);
    log("[DEPLOY] Generated Dockerfile.cloudos");
  }

  // Decide deploy mode: Docker if available + not overridden, else process
  const useDocker = (opts?.mode === "docker" || (opts?.mode !== "process" && dockerManager.available));

  if (useDocker) {
    // ── Docker container mode ──────────────────────────────────────────────
    log(`[DEPLOY] Docker mode — building container for ${appSlug}`);

    // Copy to permanent app dir first
    await cp(dir, appDir, { recursive: true, force: true });
    log(`[DEPLOY] App files saved to ${appDir}`);

    const url = getBaseUrl(req, appSlug);
    const app = await dockerManager.deployApp({
      id: appSlug,
      name,
      appDir,
      env: { PORT: "3000", NODE_ENV: "production" },
      framework: stack.framework,
      language: stack.language,
      restartPolicy: (opts?.restartPolicy as any) ?? "unless-stopped",
      memLimit: opts?.memLimit,
      cpuLimit: opts?.cpuLimit,
    });

    // Log Docker build output (from app.logs)
    app.logs.forEach(l => logs.push(l));

    if (app.status === "crashed") {
      return { ok: false, logs, stack, error: "Docker build or start failed" };
    }

    // Save project
    await _saveProjectRecord(appSlug, name, url, source, stack, appDir);
    log(`[DEPLOY] Container running on host port ${app.hostPort} → ${url}`);

    return { ok: true, url, logs, stack };

  } else {
    // ── Process mode (no Docker) ───────────────────────────────────────────
    log(`[DEPLOY] Process mode — spawning ${stack.language} process`);

    // Install deps
    if (stack.installCmd) {
      log(`[INSTALL] Running: ${stack.installCmd}`);
      const r = await run("sh", ["-c", stack.installCmd], dir);
      log(r.output.slice(0, 1000));
      if (r.code !== 0) log(`[INSTALL] Warning: install returned ${r.code}`);
    }

    // Build
    if (stack.buildCmd) {
      log(`[BUILD] Running: ${stack.buildCmd}`);
      const r = await run("sh", ["-c", stack.buildCmd], dir);
      log(r.output.slice(0, 2000));
      if (r.code !== 0) {
        // If there are HTML files, fall back to serving as static instead of failing
        let hasHtml = false;
        try {
          const topLevel = await readdir(dir);
          hasHtml = topLevel.some(f => /\.html$/i.test(f));
          if (!hasHtml) {
            // Check one level deep (e.g. public/index.html)
            for (const entry of topLevel) {
              try {
                const sub = await readdir(path.join(dir, entry));
                if (sub.some(f => /\.html$/i.test(f))) { hasHtml = true; break; }
              } catch {}
            }
          }
        } catch {}
        if (hasHtml) {
          log("[BUILD] Build failed — HTML files found, switching to static serve mode");
          stack.buildCmd = undefined;
          stack.startCmd = `npx serve -s . -l $PORT 2>/dev/null || python3 -m http.server $PORT`;
          stack.framework = "static";
        } else {
          return { ok: false, logs, stack, error: `Build failed: ${r.output.slice(0, 500)}` };
        }
      }
    }

    // Copy to permanent app dir
    await cp(dir, appDir, { recursive: true, force: true });
    log(`[DEPLOY] App files saved to ${appDir}`);

    // Spawn process
    const port = await processManager.findFreePort();
    const url = getBaseUrl(req, appSlug);
    await processManager.spawn({
      id: appSlug, name, command: "sh",
      args: ["-c", stack.startCmd.replace(/\$PORT/g, String(port))],
      cwd: appDir, port,
      env: { PORT: String(port), NODE_ENV: "production" },
      framework: stack.framework, language: stack.language, url,
    });
    log(`[DEPLOY] Process started on port ${port} → ${url}`);

    // Save project
    await _saveProjectRecord(appSlug, name, url, source, stack, appDir, port);

    return { ok: true, url, logs, stack };
  }
}

async function _saveProjectRecord(
  appSlug: string, name: string, url: string, source: string,
  stack: any, appDir: string, port?: number,
) {
  const projects = await loadProjects();
  const existing = projects.find(p => p.name === name || p.slug === appSlug);
  const now = new Date().toISOString();
  const dep = { id: `dep-${Date.now()}`, source, status: "success", url, createdAt: now, stack: `${stack.language}/${stack.framework}` };
  if (existing) {
    existing.status = "running"; existing.url = url; existing.updatedAt = now;
    existing.deployments = existing.deployments ?? [];
    existing.deployments.push(dep);
    if (port) existing.port = port;
  } else {
    projects.push({
      id: `proj-${Date.now()}`, name, slug: appSlug, status: "running",
      url, framework: stack.framework, language: stack.language,
      source, createdAt: now, updatedAt: now, appDir, port,
      deployments: [dep],
    });
  }
  await saveProject(projects);
}

// ─── Deploy from ZIP ─────────────────────────────────────────────────────────
router.post("/deploy/zip", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const file = req.files?.file as UploadedFile | undefined;
  if (!file) { res.status(400).json({ ok: false, error: "No file uploaded" }); return; }
  const name = (req.body.name as string) || file.name.replace(/\.zip$/i, "") || "myapp";
  const mode = (req.body.mode as "process" | "docker") || undefined;
  const memLimit = req.body.memLimit as string | undefined;
  const cpuLimit = req.body.cpuLimit as string | undefined;
  const restartPolicy = req.body.restartPolicy as string | undefined;
  const work = await mkdtemp(path.join(tmpdir(), "cloudos-zip-"));
  try {
    const zipPath = path.join(work, "upload.zip");
    await file.mv(zipPath);
    const zip = new AdmZip(zipPath);
    const extract = path.join(work, "src");
    await mkdir(extract, { recursive: true });
    zip.extractAllTo(extract, true);
    const entries = await readdir(extract);
    const srcDir = entries.length === 1 ? path.join(extract, entries[0]) : extract;
    const result = await deployFromDir(srcDir, req, name, "zip", { mode, memLimit, cpuLimit, restartPolicy });
    res.json({ ok: result.ok, url: result.url, stack: result.stack, logs: result.logs, error: result.error });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Deploy failed", logs: [] });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

// ─── Deploy from Git URL ──────────────────────────────────────────────────────
router.post("/deploy/git", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const { url: repoUrl, branch = "main", name: appName, mode, memLimit, cpuLimit, restartPolicy } = req.body as {
    url: string; branch?: string; name?: string;
    mode?: "process" | "docker"; memLimit?: string; cpuLimit?: string; restartPolicy?: string;
  };
  if (!repoUrl) { res.status(400).json({ ok: false, error: "url required" }); return; }

  const work = await mkdtemp(path.join(tmpdir(), "cloudos-git-"));
  try {
    const name = appName || repoUrl.split("/").pop()?.replace(/\.git$/, "") || "myapp";
    // Use GitHub token if set and repo is on GitHub
    const ghToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    const cloneUrl = ghToken && repoUrl.includes("github.com")
      ? repoUrl.replace("https://", `https://${ghToken}@`)
      : repoUrl;

    const r = await run("git", ["clone", "--depth=1", "--branch", branch, cloneUrl, "repo"], work);
    if (r.code !== 0) {
      const r2 = await run("git", ["clone", "--depth=1", cloneUrl, "repo"], work);
      if (r2.code !== 0) {
        res.status(400).json({ ok: false, error: `git clone failed: ${r2.output.slice(0, 300)}`, logs: [r2.output] });
        return;
      }
    }
    const result = await deployFromDir(path.join(work, "repo"), req, name, `git:${repoUrl}`, { mode, memLimit, cpuLimit, restartPolicy });
    res.json({ ok: result.ok, url: result.url, stack: result.stack, logs: result.logs, error: result.error });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Deploy failed", logs: [] });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

// ─── Detect stack from ZIP ────────────────────────────────────────────────────
router.post("/deploy/detect", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const file = req.files?.file as UploadedFile | undefined;
  if (!file) { res.status(400).json({ ok: false, error: "No file uploaded" }); return; }
  const work = await mkdtemp(path.join(tmpdir(), "cloudos-detect-"));
  try {
    const zipPath = path.join(work, "upload.zip");
    await file.mv(zipPath);
    const zip = new AdmZip(zipPath);
    const extract = path.join(work, "src");
    await mkdir(extract, { recursive: true });
    zip.extractAllTo(extract, true);
    const entries = await readdir(extract);
    const srcDir = entries.length === 1 ? path.join(extract, entries[0]) : extract;
    const stack = await detectStack(srcDir);
    res.json({ ok: true, stack });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

// ─── Generate Dockerfile ──────────────────────────────────────────────────────
router.post("/deploy/dockerfile", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const { projectId } = req.body as { projectId?: string };
  const projects = await loadProjects();
  const proj = projects.find(p => p.id === projectId);
  if (!proj?.appDir) { res.status(404).json({ ok: false, error: "Project not found" }); return; }
  try {
    const stack = await detectStack(proj.appDir);
    const df = generateDockerfile(stack);
    await writeFile(path.join(proj.appDir, "Dockerfile"), df);
    res.json({ ok: true, dockerfile: df, stack });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ─── Auto-repair ──────────────────────────────────────────────────────────────
router.post("/deploy/repair", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const { projectId } = req.body as { projectId?: string };
  if (!projectId) { res.status(400).json({ ok: false, error: "projectId required" }); return; }
  const proc = processManager.get(projectId);
  if (!proc) { res.status(404).json({ ok: false, error: "Process not found" }); return; }
  const result = await analyzeAndRepair(projectId, proc.cwd);
  res.json({ ok: true, result });
});

// ─── Process/container control ────────────────────────────────────────────────
router.post("/processes/:id/start", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const id = req.params.id;
  // Try Docker first, then process manager
  if (dockerManager.available && dockerManager.get(id)) {
    res.json({ ok: await dockerManager.startApp(id), mode: "docker" });
  } else {
    res.json({ ok: await processManager.restart(id), mode: "process" });
  }
});

router.post("/processes/:id/stop", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const id = req.params.id;
  if (dockerManager.available && dockerManager.get(id)) {
    res.json({ ok: await dockerManager.stopApp(id), mode: "docker" });
  } else {
    res.json({ ok: await processManager.kill(id), mode: "process" });
  }
});

router.post("/processes/:id/restart", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const id = req.params.id;
  if (dockerManager.available && dockerManager.get(id)) {
    res.json({ ok: await dockerManager.restartApp(id), mode: "docker" });
  } else {
    res.json({ ok: await processManager.restart(id), mode: "process" });
  }
});

router.delete("/processes/:id", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const id = req.params.id;
  if (dockerManager.available && dockerManager.get(id)) {
    await dockerManager.removeApp(id);
  } else {
    await processManager.kill(id);
    processManager.remove(id);
  }
  res.json({ ok: true });
});

router.get("/processes", (_req: Request, res: Response) => {
  const processes = processManager.list();
  const containers = dockerManager.available ? dockerManager.list() : [];
  res.json({ ok: true, processes, containers, dockerAvailable: dockerManager.available });
});

router.get("/processes/:id/logs", (req: Request, res: Response) => {
  const tail = parseInt((req.query.tail as string) || "100");
  const id = req.params.id;
  if (dockerManager.available && dockerManager.get(id)) {
    res.json({ ok: true, logs: dockerManager.getLogs(id, tail), mode: "docker" });
  } else {
    res.json({ ok: true, logs: processManager.getLogs(id, tail), mode: "process" });
  }
});

// ─── Docker-specific routes ───────────────────────────────────────────────────
router.get("/containers", (_req: Request, res: Response) => {
  res.json({ ok: true, available: dockerManager.available, containers: dockerManager.list() });
});

router.post("/containers/:id/start",  async (req: Request, res: Response) => { if (!assertAdmin(req, res)) return; res.json({ ok: await dockerManager.startApp(req.params.id) }); });
router.post("/containers/:id/stop",   async (req: Request, res: Response) => { if (!assertAdmin(req, res)) return; res.json({ ok: await dockerManager.stopApp(req.params.id) }); });
router.post("/containers/:id/restart",async (req: Request, res: Response) => { if (!assertAdmin(req, res)) return; res.json({ ok: await dockerManager.restartApp(req.params.id) }); });
router.delete("/containers/:id",      async (req: Request, res: Response) => { if (!assertAdmin(req, res)) return; res.json({ ok: await dockerManager.removeApp(req.params.id) }); });
router.get("/containers/:id/logs",    (req: Request, res: Response) => {
  const tail = parseInt((req.query.tail as string) || "100");
  res.json({ ok: true, logs: dockerManager.getLogs(req.params.id, tail) });
});
router.get("/containers/:id/stats",   async (req: Request, res: Response) => {
  const stats = await dockerManager.getContainerStats(req.params.id);
  res.json({ ok: !!stats, stats });
});

export default router;
