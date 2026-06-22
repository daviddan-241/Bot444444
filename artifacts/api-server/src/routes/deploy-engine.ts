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
import { analyzeAndRepair, buildRepairSuggestion } from "../lib/repair-engine";
import { assertAdmin } from "../lib/auth-guard";
import { loadProjects, saveProject } from "./projects";

const execP = promisify(execFile);
const router: IRouter = Router();

const APPS_DIR = process.env.NEZORA_APPS_DIR ?? "/tmp/nezora-apps";

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `app-${Date.now()}`;
}

function getBaseUrl(req: Request, appSlug: string): string {
  const host = process.env.RENDER_EXTERNAL_URL ?? process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : `http://${req.headers.host}`;
  return `${host}/app/${appSlug}`;
}

async function run(cmd: string, args: string[], cwd: string, env?: Record<string, string>): Promise<{ code: number; output: string }> {
  return new Promise(resolve => {
    const proc = execFile(cmd, args, { cwd, env: { ...process.env, ...(env ?? {}) } as any, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join("\n");
      resolve({ code: err ? (err as any).code ?? 1 : 0, output });
    });
    proc.stdout?.pipe(process.stdout);
    proc.stderr?.pipe(process.stderr);
  });
}

async function deployFromDir(dir: string, req: Request, name: string, source: string): Promise<{ ok: boolean; url?: string; logs: string[]; stack: any; error?: string }> {
  const logs: string[] = [];
  const log = (msg: string) => { logs.push(msg); console.log(msg); };

  log(`[DEPLOY] Detecting stack in ${dir}...`);
  const stack = await detectStack(dir);
  log(`[DETECT] Stack: ${stack.language}/${stack.framework} — ${stack.detected.join(", ")}`);

  // Write Dockerfile if missing
  if (!stack.dockerfile) {
    const df = generateDockerfile(stack);
    await writeFile(path.join(dir, "Dockerfile.cloudos"), df);
    log("[DEPLOY] Generated Dockerfile.cloudos");
  }

  // Install deps
  if (stack.installCmd) {
    log(`[INSTALL] Running: ${stack.installCmd}`);
    const r = await run("sh", ["-c", stack.installCmd], dir);
    log(r.output.slice(0, 1000));
    if (r.code !== 0) { log(`[INSTALL] Failed with code ${r.code}`); }
  }

  // Build
  if (stack.buildCmd) {
    log(`[BUILD] Running: ${stack.buildCmd}`);
    const r = await run("sh", ["-c", stack.buildCmd], dir);
    log(r.output.slice(0, 2000));
    if (r.code !== 0) {
      log("[BUILD] Build failed");
      return { ok: false, logs, stack, error: `Build failed: ${r.output.slice(0, 500)}` };
    }
  }

  // Copy to permanent app dir
  const appSlug = slug(name);
  const appDir = path.join(APPS_DIR, appSlug);
  await mkdir(appDir, { recursive: true });
  await cp(dir, appDir, { recursive: true, force: true });
  log(`[DEPLOY] App files saved to ${appDir}`);

  // Spawn process
  const port = await processManager.findFreePort();
  const url = getBaseUrl(req, appSlug);
  await processManager.spawn({
    id: appSlug, name, command: "sh",
    args: ["-c", stack.startCmd.replace(/\$PORT/g, String(port))],
    cwd: appDir, port,
    env: { PORT: String(port) },
    framework: stack.framework, language: stack.language, url,
  });
  log(`[DEPLOY] App started on port ${port} → ${url}`);

  // Save project
  const projects = await loadProjects();
  const existing = projects.find(p => p.name === name || p.slug === appSlug);
  const now = new Date().toISOString();
  if (existing) {
    existing.status = "running"; existing.url = url; existing.updatedAt = now;
    existing.deployments = existing.deployments ?? [];
    existing.deployments.push({ id: `dep-${Date.now()}`, source, status: "success", url, createdAt: now, stack: `${stack.language}/${stack.framework}` });
  } else {
    projects.push({ id: `proj-${Date.now()}`, name, slug: appSlug, status: "running", url, framework: stack.framework, language: stack.language, source, createdAt: now, updatedAt: now, appDir, deployments: [{ id: `dep-${Date.now()}`, source, status: "success", url, createdAt: now, stack: `${stack.language}/${stack.framework}` }] });
  }
  await saveProject(projects);

  return { ok: true, url, logs, stack };
}

// ─── Deploy from ZIP ────────────────────────────────────────────────────────
router.post("/deploy/zip", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const file = req.files?.file as UploadedFile | undefined;
  if (!file) { res.status(400).json({ ok: false, error: "No file uploaded" }); return; }
  const name = (req.body.name as string) || file.name.replace(/\.zip$/i, "") || "myapp";
  const work = await mkdtemp(path.join(tmpdir(), "cloudos-zip-"));
  try {
    const zipPath = path.join(work, "upload.zip");
    await file.mv(zipPath);
    const zip = new AdmZip(zipPath);
    const extract = path.join(work, "src");
    await mkdir(extract, { recursive: true });
    zip.extractAllTo(extract, true);
    // Handle nested dir
    const entries = await readdir(extract);
    const srcDir = entries.length === 1 ? path.join(extract, entries[0]) : extract;
    const result = await deployFromDir(srcDir, req, name, "zip");
    res.json({ ok: result.ok, url: result.url, stack: result.stack, logs: result.logs, error: result.error });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Deploy failed", logs: [] });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

// ─── Deploy from Git URL ─────────────────────────────────────────────────────
router.post("/deploy/git", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const { url: repoUrl, branch = "main", name: appName } = req.body as { url: string; branch?: string; name?: string };
  if (!repoUrl) { res.status(400).json({ ok: false, error: "url required" }); return; }
  const work = await mkdtemp(path.join(tmpdir(), "cloudos-git-"));
  try {
    const name = appName || repoUrl.split("/").pop()?.replace(/\.git$/, "") || "myapp";
    const r = await run("git", ["clone", "--depth=1", "--branch", branch, repoUrl, "repo"], work);
    if (r.code !== 0) {
      // Try without branch spec
      const r2 = await run("git", ["clone", "--depth=1", repoUrl, "repo"], work);
      if (r2.code !== 0) { res.status(400).json({ ok: false, error: `git clone failed: ${r2.output.slice(0, 300)}`, logs: [r2.output] }); return; }
    }
    const result = await deployFromDir(path.join(work, "repo"), req, name, `git:${repoUrl}`);
    res.json({ ok: result.ok, url: result.url, stack: result.stack, logs: result.logs, error: result.error });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Deploy failed", logs: [] });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

// ─── Detect stack from ZIP ───────────────────────────────────────────────────
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

// ─── Generate Dockerfile ─────────────────────────────────────────────────────
router.post("/deploy/dockerfile", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const { projectId } = req.body as { projectId?: string };
  const projects = await loadProjects();
  const proj = projects.find(p => p.id === projectId);
  if (!proj?.appDir) { res.status(404).json({ ok: false, error: "Project not found or not deployed" }); return; }
  try {
    const stack = await detectStack(proj.appDir);
    const df = generateDockerfile(stack);
    await writeFile(path.join(proj.appDir, "Dockerfile"), df);
    res.json({ ok: true, dockerfile: df, stack });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ─── Auto-repair ─────────────────────────────────────────────────────────────
router.post("/deploy/repair", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const { projectId } = req.body as { projectId?: string };
  if (!projectId) { res.status(400).json({ ok: false, error: "projectId required" }); return; }
  const proc = processManager.get(projectId);
  if (!proc) { res.status(404).json({ ok: false, error: "Process not found" }); return; }
  const result = await analyzeAndRepair(projectId, proc.cwd);
  res.json({ ok: true, result });
});

// ─── Process control ─────────────────────────────────────────────────────────
router.post("/processes/:id/start", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const ok = await processManager.restart(req.params.id);
  res.json({ ok });
});
router.post("/processes/:id/stop", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const ok = await processManager.kill(req.params.id);
  res.json({ ok });
});
router.post("/processes/:id/restart", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const ok = await processManager.restart(req.params.id);
  res.json({ ok });
});
router.delete("/processes/:id", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  await processManager.kill(req.params.id);
  processManager.remove(req.params.id);
  res.json({ ok: true });
});
router.get("/processes", (req: Request, res: Response) => {
  res.json({ ok: true, processes: processManager.list() });
});
router.get("/processes/:id/logs", (req: Request, res: Response) => {
  const tail = parseInt((req.query.tail as string) || "100");
  res.json({ ok: true, logs: processManager.getLogs(req.params.id, tail) });
});

export default router;
