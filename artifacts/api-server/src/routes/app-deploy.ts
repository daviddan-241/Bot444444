import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";
import { processManager } from "../lib/process-manager";
import { deployQueue } from "../lib/deploy-queue";
import { getPublicUrl } from "../lib/platform";
import { execFile } from "child_process";
import AdmZip from "adm-zip";
import path from "path";
import { mkdtemp, rm, readdir, stat, cp, readFile, mkdir, writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { loadSitesCatalog, saveSitesCatalog } from "./sites";
import { detectStack, detectPackageManager, type StackInfo } from "../lib/stack-detector";

const router: IRouter = Router();

export const APP_ROOT = process.env.NEZORA_APPS_DIR ?? path.join(process.cwd(), ".nezora-apps");
const CATALOG_FILE = path.join(APP_ROOT, ".catalog.json");

export interface AppCatalogEntry {
  id: string; name: string; command: string; args: string[];
  cwd: string; env: Record<string, string>;
  framework: string; language: string; createdAt: number;
}

export async function loadCatalog(): Promise<Record<string, AppCatalogEntry>> {
  try { return JSON.parse(await readFile(CATALOG_FILE, "utf8")); } catch { return {}; }
}

export async function saveCatalog(cat: Record<string, AppCatalogEntry>) {
  await mkdir(APP_ROOT, { recursive: true });
  await writeFile(CATALOG_FILE, JSON.stringify(cat, null, 2));
}

export async function restoreApps() {
  const cat = await loadCatalog();
  for (const entry of Object.values(cat)) {
    try {
      if (!(await stat(entry.cwd).then(s => s.isDirectory()).catch(() => false))) {
        console.warn(`[restore] Skipping ${entry.id}: cwd not found (${entry.cwd})`);
        continue;
      }
      const isWorker = entry.framework.includes("-bot") || entry.framework.includes("worker");
      await processManager.spawn({
        id: entry.id, name: entry.name, command: entry.command,
        args: entry.args, cwd: entry.cwd, env: entry.env,
        framework: entry.framework, language: entry.language,
        port: isWorker ? 0 : undefined,
      });
      console.log(`[restore] Started: ${entry.name} (${entry.id})`);
    } catch (e) { console.warn(`[restore] Failed to restart ${entry.id}:`, e); }
  }
}

// ── Low-level exec helper ──────────────────────────────────────────────────

function runCmd(
  command: string,
  args: readonly string[],
  cwd: string,
  env?: Record<string, string>,
  timeoutMs = 20 * 60 * 1000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(command, args, {
      cwd, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...env },
    }, (error, stdout, stderr) => {
      const rawCode = (error as any)?.code;
      const code = typeof rawCode === "number" ? rawCode : error ? 127 : 0;
      resolve({ code, stdout: stdout.slice(0, 10000), stderr: (stderr || String(error?.message || "")).slice(0, 10000) });
    });
  });
}

function runShell(
  cmd: string,
  cwd: string,
  env?: Record<string, string>,
  timeoutMs = 20 * 60 * 1000,
): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const parts = cmd.trim().split(/\s+/);
    execFile(parts[0], parts.slice(1), {
      cwd, shell: true, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...env },
    }, (error, stdout, stderr) => {
      const rawCode = (error as any)?.code;
      const code = typeof rawCode === "number" ? rawCode : error ? 127 : 0;
      resolve({ code, out: (stderr || stdout || String(error?.message || "")).slice(0, 10000) });
    });
  });
}

const BUILD_ENV = { CI: "true", NODE_ENV: "production", PYTHONDONTWRITEBYTECODE: "1", PYTHONUNBUFFERED: "1" };

// ── workspace: protocol sanitizer ─────────────────────────────────────────

async function sanitizeWorkspaceDeps(dir: string, log: (m: string) => void): Promise<void> {
  const pkgPath = path.join(dir, "package.json");
  try {
    const raw = await readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    let changed = false;
    for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const) {
      for (const [key, val] of Object.entries((pkg[section] ?? {}) as Record<string, string>)) {
        if (typeof val === "string" && val.startsWith("workspace:")) {
          (pkg[section] as any)[key] = "*";
          changed = true;
        }
      }
    }
    if (changed) {
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2));
      log("Rewrote workspace: protocol deps to * for standalone install");
    }
  } catch { /* no package.json */ }

  try { await unlink(path.join(dir, "pnpm-lock.yaml")); } catch { /* ok */ }
}

// ── Comprehensive install runner ───────────────────────────────────────────

async function runInstall(dir: string, stack: StackInfo, log: (m: string) => void): Promise<void> {
  if (!stack.installCmd) return;

  const pm = stack.packageManager;
  const env = { ...BUILD_ENV };

  // Node.js installs — sanitize workspace: deps first
  if (["npm", "yarn", "pnpm", "bun"].includes(pm)) {
    await sanitizeWorkspaceDeps(dir, log);
  }

  // Re-detect pm after possible pnpm-lock.yaml removal
  const reFiles = await readdir(dir).catch(() => [] as string[]);
  const actualPm = ["npm", "yarn", "pnpm", "bun"].includes(pm)
    ? detectPackageManager(reFiles)
    : pm;

  log(`Installing dependencies (${pm})...`);

  const attempt = async (cmd: string, args: string[]): Promise<boolean> => {
    const r = await runCmd(cmd, args, dir, env);
    if (r.code === 0) return true;
    log(`  Install attempt failed: ${(r.stderr || r.stdout).slice(0, 300)}`);
    return false;
  };

  // ── Node.js package managers ──────────────────────────────────────────────
  if (actualPm === "pnpm") {
    if (await attempt("pnpm", ["install", "--no-frozen-lockfile"])) { log("Dependencies installed."); return; }
    log("pnpm failed, installing pnpm globally and retrying...");
    await runCmd("npm", ["install", "-g", "pnpm"], dir, env);
    if (await attempt("pnpm", ["install", "--no-frozen-lockfile"])) { log("Dependencies installed."); return; }
    log("pnpm failed, falling back to npm...");
  }

  if (actualPm === "yarn") {
    if (await attempt("yarn", ["install", "--non-interactive", "--frozen-lockfile=false"])) { log("Dependencies installed."); return; }
    log("yarn failed, falling back to npm...");
  }

  if (actualPm === "bun") {
    if (await attempt("bun", ["install"])) { log("Dependencies installed."); return; }
    log("bun failed, falling back to npm...");
  }

  if (["npm", "pnpm", "yarn", "bun"].includes(actualPm)) {
    if (await attempt("npm", ["install", "--production=false"])) { log("Dependencies installed."); return; }
    if (await attempt("npm", ["install", "--legacy-peer-deps"])) { log("Dependencies installed."); return; }
    if (await attempt("npm", ["install", "--force"])) { log("Dependencies installed."); return; }
    throw new Error("npm install failed after all fallbacks. Check the deploy log above for details.");
  }

  // ── Python package managers ───────────────────────────────────────────────
  if (pm === "pip" || pm === "uv") {
    // uv is much faster than pip — try it first
    const uvAvailable = (await runCmd("uv", ["--version"], dir, env)).code === 0;
    if (uvAvailable && pm !== "pip") {
      const cmd = stack.installCmd.replace(/^pip /, "uv pip ").replace("--no-cache-dir", "");
      if (await attempt("sh", ["-c", cmd + " --system"])) { log("Python dependencies installed (uv)."); return; }
    }

    // Pip with possible global install flag
    const pipCmd = stack.installCmd.includes("requirements.txt")
      ? ["pip", "install", "-r", "requirements.txt", "--no-cache-dir", "--break-system-packages"]
      : ["pip", "install", "-e", ".", "--no-cache-dir", "--break-system-packages"];
    if (await attempt(pipCmd[0], pipCmd.slice(1))) { log("Python dependencies installed (pip)."); return; }

    // Try without --break-system-packages for older pip
    const pipCmd2 = pipCmd.filter(a => a !== "--break-system-packages");
    if (await attempt(pipCmd2[0], pipCmd2.slice(1))) { log("Python dependencies installed (pip)."); return; }

    throw new Error("pip install failed. Check requirements.txt for invalid packages.");
  }

  if (pm === "poetry") {
    if (await attempt("poetry", ["install", "--no-interaction", "--no-ansi"])) { log("Python dependencies installed (poetry)."); return; }
    // Install poetry if not available
    log("poetry not found, installing via pip...");
    await runCmd("pip", ["install", "poetry", "--break-system-packages"], dir, env);
    if (await attempt("poetry", ["install", "--no-interaction", "--no-ansi"])) { log("Python dependencies installed (poetry)."); return; }
    throw new Error("poetry install failed.");
  }

  if (pm === "pipenv") {
    if (await attempt("pipenv", ["install", "--deploy", "--system"])) { log("Python dependencies installed (pipenv)."); return; }
    await runCmd("pip", ["install", "pipenv", "--break-system-packages"], dir, env);
    if (await attempt("pipenv", ["install", "--deploy", "--system"])) { log("Python dependencies installed (pipenv)."); return; }
    throw new Error("pipenv install failed.");
  }

  // ── Ruby ──────────────────────────────────────────────────────────────────
  if (pm === "bundler") {
    if (await attempt("bundle", ["install", "--jobs=4"])) { log("Ruby dependencies installed."); return; }
    // Install bundler if needed
    await runCmd("gem", ["install", "bundler", "--no-document"], dir, env);
    if (await attempt("bundle", ["install", "--jobs=4"])) { log("Ruby dependencies installed."); return; }
    throw new Error("bundle install failed.");
  }

  // ── PHP ───────────────────────────────────────────────────────────────────
  if (pm === "composer") {
    if (await attempt("composer", ["install", "--no-dev", "--optimize-autoloader", "--no-interaction"])) { log("PHP dependencies installed."); return; }
    throw new Error("composer install failed.");
  }

  // ── Go ────────────────────────────────────────────────────────────────────
  if (pm === "go") {
    if (await attempt("go", ["mod", "download"])) { log("Go modules downloaded."); return; }
    if (await attempt("go", ["mod", "tidy"])) { log("Go modules tidied."); return; }
    throw new Error("go mod download failed.");
  }

  // ── Java (Maven) ──────────────────────────────────────────────────────────
  if (pm === "maven") {
    const mvnCmd = (await runCmd("sh", ["-c", "test -x ./mvnw && echo ok"], dir, env)).code === 0 ? "./mvnw" : "mvn";
    if (await attempt(mvnCmd, ["dependency:resolve", "-q"])) { log("Maven dependencies resolved."); return; }
  }

  // ── Java (Gradle) ────────────────────────────────────────────────────────
  if (pm === "gradle") {
    const gradleCmd = (await runCmd("sh", ["-c", "test -x ./gradlew && echo ok"], dir, env)).code === 0 ? "./gradlew" : "gradle";
    if (await attempt(gradleCmd, ["dependencies", "-q"])) { log("Gradle dependencies resolved."); return; }
  }

  log(`Install step skipped (no handler for pm: ${pm})`);
}

// ── Build runner ───────────────────────────────────────────────────────────

async function runBuild(dir: string, buildCmd: string, log: (m: string) => void): Promise<void> {
  log(`Building (${buildCmd})...`);
  const result = await runShell(buildCmd, dir, BUILD_ENV, 25 * 60 * 1000);
  if (result.code !== 0) {
    throw new Error(`Build failed (exit ${result.code}): ${result.out.slice(0, 600)}`);
  }
  log("Build complete.");
}

// ── File helpers ───────────────────────────────────────────────────────────

async function walk(dir: string, root = dir): Promise<string[]> {
  const entries = await readdir(dir).catch(() => []);
  const out: string[] = [];
  for (const e of entries) {
    if ([".git", "node_modules", ".next", "dist", "build", "__pycache__", ".venv", "venv", ".yarn", "target", "vendor"].includes(e)) continue;
    const full = path.join(dir, e);
    const s = await stat(full).catch(() => null);
    if (!s) continue;
    if (s.isDirectory()) out.push(...await walk(full, root));
    else out.push(path.relative(root, full));
    if (out.length > 8000) break;
  }
  return out;
}

async function readOptional(file: string): Promise<string | undefined> {
  try { return await readFile(file, "utf8"); } catch { return undefined; }
}

async function normalizeRoot(dir: string): Promise<string> {
  const entries = await readdir(dir).catch(() => []);
  if (entries.length === 1) {
    const only = path.join(dir, entries[0]);
    if ((await stat(only).catch(() => null))?.isDirectory()) return only;
  }
  return dir;
}

function safeExtract(zipBuffer: Buffer, dest: string) {
  const zip = new AdmZip(zipBuffer);
  const target = path.resolve(dest);
  for (const entry of zip.getEntries()) {
    const out = path.resolve(dest, entry.entryName);
    if (!out.startsWith(target + path.sep) && out !== target) throw new Error(`Unsafe ZIP path: ${entry.entryName}`);
    if (entry.header.size > 500 * 1024 * 1024) throw new Error(`Entry too large: ${entry.entryName}`);
  }
  zip.extractAllTo(dest, true);
}

async function cpExcludeJunk(src: string, dest: string): Promise<void> {
  const SKIP = new Set(["node_modules", ".git", ".pnp", ".yarn/cache", ".yarn/unplugged", "__pycache__", ".venv", "venv", ".tox", "vendor/bundle"]);
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    if (SKIP.has(entry.name)) return;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) await cpExcludeJunk(srcPath, destPath);
    else await cp(srcPath, destPath);
  }));
}

// ── Parse start command into cmd + args ────────────────────────────────────

function parseCmd(startCmd: string): { cmd: string; args: string[] } {
  const parts = startCmd.trim().split(/\s+/);
  return { cmd: parts[0], args: parts.slice(1) };
}

// ── Main deploy logic ──────────────────────────────────────────────────────

async function deployApp(opts: {
  sourceDir: string; name: string; slug: string;
  log: (m: string) => void; origin: string;
  envOverride?: Record<string, string>;
}) {
  const { sourceDir, name, slug, log, origin, envOverride = {} } = opts;

  // Detect the full stack
  log("Detecting stack...");
  const stack = await detectStack(sourceDir);
  log(`Language: ${stack.language} | Framework: ${stack.framework} | Runtime: ${stack.runtime}`);
  log(`Package manager: ${stack.packageManager} | Confidence: ${stack.confidence}`);
  log(`Detected signals: ${stack.detected.join(", ")}`);
  if (stack.procfile) log(`Procfile found: ${Object.keys(stack.procfile).join(", ")}`);

  // Install
  if (stack.installCmd) {
    await runInstall(sourceDir, stack, log);
  } else {
    log("No install step needed.");
  }

  // For static sites — build in sourceDir then copy output to site store
  if (stack.appKind === "static") {
    if (stack.buildCmd) {
      await runBuild(sourceDir, stack.buildCmd, log);
    }

    const { LOCAL_SITE_ROOT } = await import("./static-serve");
    const siteDest = path.join(LOCAL_SITE_ROOT, slug);
    await rm(siteDest, { recursive: true, force: true });
    await mkdir(siteDest, { recursive: true });

    const outputSrc = stack.outputDir ? path.join(sourceDir, stack.outputDir) : sourceDir;
    const outStat = await stat(outputSrc).catch(() => null);
    if (!outStat?.isDirectory()) {
      log(`Output dir '${stack.outputDir}' not found after build — serving project root.`);
      await cp(sourceDir, siteDest, { recursive: true });
    } else {
      await cp(outputSrc, siteDest, { recursive: true });
    }

    const idxPath = path.join(siteDest, "index.html");
    const hasIndex = await stat(idxPath).then(s => s.isFile()).catch(() => false);
    if (!hasIndex) log("Warning: No index.html found in output — site may not load correctly.");

    const siteUrl = `${origin}/api/s/${slug}/`;
    const sitesCat = await loadSitesCatalog();
    sitesCat[slug] = {
      ...(sitesCat[slug] ?? {}), slug, name, url: siteUrl,
      framework: stack.framework, type: "static",
      createdAt: sitesCat[slug]?.createdAt ?? Date.now(), updatedAt: Date.now(),
    } as any;
    await saveSitesCatalog(sitesCat).catch(() => {});
    log(`Static site live at ${siteUrl}`);
    return { type: "static-site", slug, url: siteUrl, framework: stack.framework };
  }

  // For workers and web apps — copy source, install, build in final persistent dir
  const appDest = path.join(APP_ROOT, slug);
  await mkdir(APP_ROOT, { recursive: true });
  await rm(appDest, { recursive: true, force: true });

  log(`Copying source to ${path.basename(appDest)}...`);
  await cpExcludeJunk(sourceDir, appDest);

  // Run install in final dir (node_modules stay there across restarts)
  if (stack.installCmd) {
    await runInstall(appDest, stack, log);
  }

  // Build
  if (stack.buildCmd) {
    await runBuild(appDest, stack.buildCmd, log);
  }

  // Parse start command
  const { cmd, args } = parseCmd(stack.startCmd);
  log(`Starting: ${cmd} ${args.join(" ")}`);

  // Merge env: injected env vars + PORT
  const processEnv: Record<string, string> = {
    NODE_ENV: "production",
    PYTHONUNBUFFERED: "1",
    ...envOverride,
  };

  if (stack.appKind === "worker") {
    await processManager.spawn({
      id: slug, name, command: cmd, args, cwd: appDest,
      port: 0, framework: stack.framework, language: stack.language,
      env: processEnv,
    });
    const cat = await loadCatalog();
    cat[slug] = { id: slug, name, command: cmd, args, cwd: appDest, env: processEnv, framework: stack.framework, language: stack.language, createdAt: Date.now() };
    await saveCatalog(cat);
    log(`Worker is running (${stack.framework}) — background process, no URL`);
    return { type: "worker", slug, url: null, framework: stack.framework };
  }

  // Web server
  await processManager.spawn({
    id: slug, name, command: cmd, args, cwd: appDest,
    framework: stack.framework, language: stack.language,
    env: processEnv,
  });

  const appUrl = `${origin}/app/${slug}/`;
  processManager.updateUrl(slug, appUrl);

  const cat = await loadCatalog();
  cat[slug] = { id: slug, name, command: cmd, args, cwd: appDest, env: processEnv, framework: stack.framework, language: stack.language, createdAt: Date.now() };
  await saveCatalog(cat);

  log(`Live at ${appUrl}`);
  return { type: "live-app", slug, url: appUrl, framework: stack.framework };
}

// ── Route: POST /api/real/app-deploy/zip ──────────────────────────────────

router.post("/real/app-deploy/zip", async (req: any, res) => {
  if (!assertAdmin(req, res)) return;
  const file = req.files?.file;
  if (!file) { res.status(400).json({ ok: false, message: "Missing ZIP file." }); return; }
  if ((file.data?.length || file.size || 0) > 200 * 1024 * 1024) {
    res.status(413).json({ ok: false, message: "ZIP too large (max 200MB)." }); return;
  }

  const fileBuffer: Buffer = (file.data && file.data.length > 0)
    ? file.data
    : await readFile(file.tempFilePath);
  const projectName = String(req.body?.name || file.name?.replace(/\.zip$/i, "") || "app");
  const customSlug = String(req.body?.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
  const slug = customSlug || `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36)}`;
  const origin = getPublicUrl(req);
  const envBody = req.body?.env;
  const envOverride: Record<string, string> = envBody ? (typeof envBody === "string" ? JSON.parse(envBody) : envBody) : {};

  const job = deployQueue.enqueue(slug, projectName, async (log) => {
    const work = await mkdtemp(path.join(tmpdir(), "nezora-zip-"));
    try {
      log(`Extracting ZIP (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB)...`);
      const extractDir = path.join(work, "extract");
      await mkdir(extractDir, { recursive: true });
      safeExtract(fileBuffer, extractDir);
      const sourceDir = await normalizeRoot(extractDir);
      return await deployApp({ sourceDir, name: projectName, slug, log, origin, envOverride });
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  });

  res.json({ ok: true, jobId: job.id, slug, message: "Deploy queued." });
});

// ── Route: POST /api/real/app-deploy/git ─────────────────────────────────

router.post("/real/app-deploy/git", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { url, branch = "main", name, token, slug: rawSlug } = req.body;
  if (!url) { res.status(400).json({ ok: false, message: "url is required." }); return; }

  const projectName = name || url.split("/").pop()?.replace(/\.git$/, "") || "app";
  const customSlug = String(rawSlug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
  const slug = customSlug || `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36)}`;
  const origin = getPublicUrl(req);

  // Build authenticated clone URL
  let cloneUrl = url;
  if (token && !url.includes("@")) {
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      u.username = token;
      cloneUrl = u.toString();
    } catch { /* malformed url — use as-is */ }
  }

  const envBody = req.body?.env;
  const envOverride: Record<string, string> = envBody ? (typeof envBody === "string" ? JSON.parse(envBody) : envBody) : {};

  const job = deployQueue.enqueue(slug, projectName, async (log) => {
    const work = await mkdtemp(path.join(tmpdir(), "nezora-git-"));
    try {
      log(`Cloning ${url} (branch: ${branch})...`);
      const cloneResult = await runCmd("git", ["clone", "--depth=1", "--branch", branch, cloneUrl, "repo"], work, BUILD_ENV, 5 * 60 * 1000);
      if (cloneResult.code !== 0) {
        log(`Branch '${branch}' not found, trying default branch...`);
        const r2 = await runCmd("git", ["clone", "--depth=1", cloneUrl, "repo"], work, BUILD_ENV, 5 * 60 * 1000);
        if (r2.code !== 0) throw new Error(`git clone failed: ${r2.stderr.slice(0, 400)}`);
      }
      log("Clone complete.");

      const sourceDir = path.join(work, "repo");

      // Inject env vars as .env file
      if (Object.keys(envOverride).length > 0) {
        const envLines = Object.entries(envOverride).map(([k, v]) => `${k}=${v}`).join("\n");
        await writeFile(path.join(sourceDir, ".env"), envLines);
        log(`Injected ${Object.keys(envOverride).length} environment variable(s).`);
      }

      return await deployApp({ sourceDir, name: projectName, slug, log, origin, envOverride });
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  });

  res.json({ ok: true, jobId: job.id, slug, message: "Deploy queued." });
});

// ── Route: GET /api/real/deploy-jobs/:id ─────────────────────────────────

router.get("/real/deploy-jobs/:id", async (req, res) => {
  const job = deployQueue.get(req.params.id);
  if (!job) { res.status(404).json({ ok: false, message: "Job not found" }); return; }
  res.json({ ok: true, job: { id: job.id, status: job.status, logs: job.logs, result: job.result, error: job.error, createdAt: job.createdAt } });
});

// ── Route: GET /api/real/deploy-jobs ─────────────────────────────────────

router.get("/real/deploy-jobs", async (_req, res) => {
  const jobs = deployQueue.list().map(j => ({ id: j.id, status: j.status, name: j.name, slug: j.slug, createdAt: j.createdAt, error: j.error }));
  res.json({ ok: true, jobs });
});

export default router;
