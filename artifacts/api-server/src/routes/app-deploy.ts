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
        console.warn(`[restore] Skipping ${entry.id}: directory missing (${entry.cwd})`);
        continue;
      }
      const isWorker = entry.framework.includes("-bot") || entry.framework.includes("worker");
      await processManager.spawn({
        id: entry.id, name: entry.name, command: entry.command,
        args: entry.args, cwd: entry.cwd, env: entry.env,
        framework: entry.framework, language: entry.language,
        port: isWorker ? 0 : undefined,
      });
      console.log(`[restore] Started: ${entry.name} (${entry.id}) — ${entry.framework}`);
    } catch (e) {
      console.warn(`[restore] Failed to restart ${entry.id}:`, e);
    }
  }
}

// ── Shell command runner ──────────────────────────────────────────────────

function runCmd(
  command: string, args: readonly string[], cwd: string,
  env?: Record<string, string>, timeoutMs = 20 * 60 * 1000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(command, args, {
      cwd, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...env },
    }, (error, stdout, stderr) => {
      const rawCode = (error as any)?.code;
      const code = typeof rawCode === "number" ? rawCode : error ? 127 : 0;
      resolve({ code, stdout: (stdout ?? "").slice(0, 12000), stderr: (stderr || String(error?.message ?? "")).slice(0, 12000) });
    });
  });
}

function runShell(
  cmd: string, cwd: string,
  env?: Record<string, string>, timeoutMs = 25 * 60 * 1000,
): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile("sh", ["-c", cmd], {
      cwd, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...env },
    }, (error, stdout, stderr) => {
      const rawCode = (error as any)?.code;
      const code = typeof rawCode === "number" ? rawCode : error ? 127 : 0;
      const out = (stderr || stdout || String(error?.message ?? "")).slice(0, 12000);
      resolve({ code, out });
    });
  });
}

const BUILD_ENV: Record<string, string> = {
  CI: "true", NODE_ENV: "production",
  PYTHONDONTWRITEBYTECODE: "1", PYTHONUNBUFFERED: "1",
  GEM_HOME: "/root/.gem", PATH: process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
};

// ── workspace: protocol sanitizer ────────────────────────────────────────

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
      log("Rewrote workspace:* deps to * for standalone install");
    }
  } catch { /* no package.json or parse error */ }
  try { await unlink(path.join(dir, "pnpm-lock.yaml")); } catch { /* ok */ }
}

// ── Install runner — handles ALL package managers ─────────────────────────

async function runInstall(dir: string, stack: StackInfo, log: (m: string) => void): Promise<void> {
  if (!stack.installCmd) return;

  const pm = stack.packageManager;

  log(`Installing dependencies (${pm})...`);

  const attempt = async (cmd: string, args: string[]): Promise<boolean> => {
    const r = await runCmd(cmd, args, dir, BUILD_ENV);
    if (r.code === 0) return true;
    const msg = (r.stderr || r.stdout).replace(/\n/g, " ").slice(0, 400);
    log(`  Failed: ${msg}`);
    return false;
  };

  // ── Node.js ─────────────────────────────────────────────────────────────
  if (["npm", "pnpm", "yarn", "bun"].includes(pm)) {
    await sanitizeWorkspaceDeps(dir, log);
    // Re-check after removing pnpm-lock.yaml
    const reFiles = await readdir(dir).catch(() => [] as string[]);
    const actualPm = detectPackageManager(reFiles);

    if (actualPm === "pnpm") {
      log("Using pnpm...");
      // Try global pnpm first
      if (await attempt("pnpm", ["install", "--no-frozen-lockfile"])) { log("Dependencies installed."); return; }
      log("pnpm not found globally — installing via npm...");
      await runCmd("npm", ["install", "-g", "pnpm"], dir, BUILD_ENV);
      if (await attempt("pnpm", ["install", "--no-frozen-lockfile"])) { log("Dependencies installed."); return; }
      log("Falling back to npm...");
    } else if (actualPm === "yarn") {
      log("Using yarn...");
      if (await attempt("yarn", ["install", "--non-interactive", "--frozen-lockfile=false"])) { log("Dependencies installed."); return; }
      log("Falling back to npm...");
    } else if (actualPm === "bun") {
      log("Using bun...");
      if (await attempt("bun", ["install"])) { log("Dependencies installed."); return; }
      log("Falling back to npm...");
    }

    // npm fallback chain
    if (await attempt("npm", ["install", "--production=false"])) { log("Dependencies installed."); return; }
    if (await attempt("npm", ["install", "--legacy-peer-deps"])) { log("Dependencies installed."); return; }
    if (await attempt("npm", ["install", "--force"])) { log("Dependencies installed."); return; }
    throw new Error("npm install failed after all fallbacks. Check for incompatible package versions or corrupted package.json.");
  }

  // ── Python ───────────────────────────────────────────────────────────────
  if (pm === "pip" || pm === "uv") {
    // Try uv (much faster than pip) if available
    const uvVer = await runCmd("uv", ["--version"], dir, BUILD_ENV);
    if (uvVer.code === 0) {
      const uvArgs = stack.installCmd.includes("requirements.txt")
        ? ["uv", "pip", "install", "-r", "requirements.txt", "--system"]
        : ["uv", "pip", "install", "-e", ".", "--system"];
      if (await attempt(uvArgs[0], uvArgs.slice(1))) { log(`Python dependencies installed (uv).`); return; }
    }

    // pip with --break-system-packages (needed on Python 3.12+ in system install)
    const hasReqs = (await readdir(dir).catch(() => [])).some(f => f.toLowerCase() === "requirements.txt");
    if (hasReqs) {
      if (await attempt("pip", ["install", "-r", "requirements.txt", "--no-cache-dir", "--break-system-packages"])) { log("Python dependencies installed (pip)."); return; }
      if (await attempt("pip3", ["install", "-r", "requirements.txt", "--no-cache-dir", "--break-system-packages"])) { log("Python dependencies installed (pip3)."); return; }
      // Without --break-system-packages for older Pythons
      if (await attempt("pip", ["install", "-r", "requirements.txt", "--no-cache-dir"])) { log("Python dependencies installed (pip)."); return; }
      if (await attempt("pip3", ["install", "-r", "requirements.txt", "--no-cache-dir"])) { log("Python dependencies installed (pip3)."); return; }
    } else {
      if (await attempt("pip", ["install", "-e", ".", "--no-cache-dir", "--break-system-packages"])) { log("Python dependencies installed (pip)."); return; }
      if (await attempt("pip", ["install", "-e", ".", "--no-cache-dir"])) { log("Python dependencies installed (pip)."); return; }
    }
    throw new Error("pip install failed. Check requirements.txt for invalid package names or version conflicts.");
  }

  if (pm === "poetry") {
    if (await attempt("poetry", ["install", "--no-interaction", "--no-ansi"])) { log("Python dependencies installed (poetry)."); return; }
    // Install poetry if not found
    log("poetry not available — installing via pip...");
    await runCmd("pip", ["install", "poetry", "--break-system-packages"], dir, BUILD_ENV);
    if (await attempt("poetry", ["install", "--no-interaction", "--no-ansi"])) { log("Python dependencies installed (poetry)."); return; }
    throw new Error("poetry install failed.");
  }

  if (pm === "pipenv") {
    if (await attempt("pipenv", ["install", "--deploy", "--system"])) { log("Python dependencies installed (pipenv)."); return; }
    await runCmd("pip", ["install", "pipenv", "--break-system-packages"], dir, BUILD_ENV);
    if (await attempt("pipenv", ["install", "--deploy", "--system"])) { log("Python dependencies installed (pipenv)."); return; }
    throw new Error("pipenv install failed.");
  }

  // ── Ruby ─────────────────────────────────────────────────────────────────
  if (pm === "bundler") {
    if (await attempt("bundle", ["install", "--jobs=4"])) { log("Ruby gems installed."); return; }
    await runCmd("gem", ["install", "bundler", "--no-document"], dir, BUILD_ENV);
    if (await attempt("bundle", ["install", "--jobs=4"])) { log("Ruby gems installed."); return; }
    throw new Error("bundle install failed.");
  }

  // ── PHP ───────────────────────────────────────────────────────────────────
  if (pm === "composer") {
    if (await attempt("composer", ["install", "--no-dev", "--optimize-autoloader", "--no-interaction"])) { log("PHP dependencies installed."); return; }
    throw new Error("composer install failed. Ensure composer.json is valid.");
  }

  // ── Go ────────────────────────────────────────────────────────────────────
  if (pm === "go") {
    if (await attempt("go", ["mod", "download"])) { log("Go modules downloaded."); return; }
    if (await attempt("go", ["mod", "tidy"])) { log("Go modules tidied."); return; }
    throw new Error("go mod download failed.");
  }

  log(`No install handler for pm '${pm}' — skipping.`);
}

// ── Build runner ──────────────────────────────────────────────────────────

async function runBuild(dir: string, buildCmd: string, log: (m: string) => void): Promise<void> {
  log(`Building: ${buildCmd}`);
  const result = await runShell(buildCmd, dir, BUILD_ENV, 25 * 60 * 1000);
  if (result.code !== 0) {
    throw new Error(`Build failed (exit ${result.code}): ${result.out.slice(0, 800)}`);
  }
  log("Build complete.");
}

// ── File utilities ─────────────────────────────────────────────────────────

const COPY_SKIP = new Set([
  "node_modules", ".git", ".pnp", ".yarn/cache", ".yarn/unplugged",
  "__pycache__", ".venv", "venv", ".tox", "vendor/bundle",
  ".mypy_cache", ".pytest_cache", ".ruff_cache",
]);

async function cpSmart(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    if (COPY_SKIP.has(entry.name)) return;
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) await cpSmart(srcPath, destPath);
    else await cp(srcPath, destPath);
  }));
}

async function normalizeRoot(dir: string): Promise<string> {
  const entries = await readdir(dir).catch(() => []);
  if (entries.length === 1) {
    const only = path.join(dir, entries[0]);
    if ((await stat(only).catch(() => null))?.isDirectory()) return only;
  }
  return dir;
}

function safeExtract(zipBuffer: Buffer, dest: string): void {
  const zip = new AdmZip(zipBuffer);
  const target = path.resolve(dest);
  for (const entry of zip.getEntries()) {
    const out = path.resolve(dest, entry.entryName);
    if (!out.startsWith(target + path.sep) && out !== target) {
      throw new Error(`Unsafe ZIP path: ${entry.entryName}`);
    }
    if (entry.header.size > 500 * 1024 * 1024) {
      throw new Error(`Entry too large: ${entry.entryName}`);
    }
  }
  zip.extractAllTo(dest, true);
}

function parseCmd(startCmd: string): { cmd: string; args: string[] } {
  const parts = startCmd.trim().split(/\s+/);
  return { cmd: parts[0], args: parts.slice(1) };
}

// ── Core deploy function ──────────────────────────────────────────────────

async function deployApp(opts: {
  sourceDir: string; name: string; slug: string;
  log: (m: string) => void; origin: string;
  envOverride?: Record<string, string>;
}) {
  const { sourceDir, name, slug, log, origin, envOverride = {} } = opts;

  // ── 1. Detect stack ────────────────────────────────────────────────────
  log("Detecting project stack...");
  const stack = await detectStack(sourceDir);
  log(`Language    : ${stack.language}`);
  log(`Framework   : ${stack.framework}`);
  log(`Runtime     : ${stack.runtime}`);
  log(`Package mgr : ${stack.packageManager}`);
  log(`App type    : ${stack.appKind} (${stack.framework})`);
  log(`Confidence  : ${stack.confidence}`);
  if (stack.procfile) log(`Procfile    : ${JSON.stringify(stack.procfile)}`);
  log(`Signals     : ${stack.detected.join(" | ")}`);

  // ── 2. STATIC SITE PATH ─────────────────────────────────────────────────
  if (stack.appKind === "static") {
    log("Static site detected — building in source directory...");
    if (stack.installCmd) await runInstall(sourceDir, stack, log);
    if (stack.buildCmd)   await runBuild(sourceDir, stack.buildCmd, log);

    const { LOCAL_SITE_ROOT } = await import("./static-serve");
    const siteDest = path.join(LOCAL_SITE_ROOT, slug);
    await rm(siteDest, { recursive: true, force: true });
    await mkdir(siteDest, { recursive: true });

    const outputSrc = stack.outputDir ? path.join(sourceDir, stack.outputDir) : sourceDir;
    const outStat   = await stat(outputSrc).catch(() => null);
    if (!outStat?.isDirectory()) {
      log(`Output dir '${stack.outputDir ?? "."}' not found — copying project root.`);
      await cpSmart(sourceDir, siteDest);
    } else {
      await cp(outputSrc, siteDest, { recursive: true });
    }

    const hasIndex = await stat(path.join(siteDest, "index.html")).then(s => s.isFile()).catch(() => false);
    if (!hasIndex) log("Warning: No index.html found — site may not render correctly.");

    const siteUrl = `${origin}/api/s/${slug}/`;
    const sitesCat = await loadSitesCatalog();
    (sitesCat as any)[slug] = {
      ...(sitesCat[slug] ?? {}), slug, name, url: siteUrl,
      framework: stack.framework, type: "static",
      createdAt: (sitesCat[slug] as any)?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    await saveSitesCatalog(sitesCat).catch(() => {});
    log(`Static site live at: ${siteUrl}`);
    return { type: "static-site", slug, url: siteUrl, framework: stack.framework };
  }

  // ── 3. LIVE PROCESS / WORKER PATH ──────────────────────────────────────
  const appDest = path.join(APP_ROOT, slug);
  await mkdir(APP_ROOT, { recursive: true });
  await rm(appDest, { recursive: true, force: true });

  log(`Copying source to ${path.basename(appDest)}...`);
  await cpSmart(sourceDir, appDest);

  // Install in FINAL directory (node_modules/site-packages stay across restarts)
  if (stack.installCmd) {
    await runInstall(appDest, stack, log);
  } else {
    log("No dependencies to install.");
  }

  // Build in final directory
  if (stack.buildCmd) {
    await runBuild(appDest, stack.buildCmd, log);
  }

  // ── 4. Start process ───────────────────────────────────────────────────
  const { cmd, args } = parseCmd(stack.startCmd);
  log(`Starting : ${cmd} ${args.join(" ")}`);

  const processEnv: Record<string, string> = {
    NODE_ENV: "production",
    PYTHONUNBUFFERED: "1",
    PYTHONDONTWRITEBYTECODE: "1",
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
    log(`Worker running (${stack.framework}) — background process, no HTTP port.`);
    return { type: "worker", slug, url: null, framework: stack.framework };
  }

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

// ── POST /api/real/app-deploy/zip ─────────────────────────────────────────

router.post("/real/app-deploy/zip", async (req: any, res) => {
  if (!assertAdmin(req, res)) return;

  const file = req.files?.file;
  if (!file) { res.status(400).json({ ok: false, message: "No file uploaded." }); return; }

  const sizeMb = (file.data?.length || file.size || 0) / 1024 / 1024;
  if (sizeMb > 200) { res.status(413).json({ ok: false, message: "ZIP too large (max 200 MB)." }); return; }

  const fileBuffer: Buffer = (file.data && file.data.length > 0)
    ? file.data : await readFile(file.tempFilePath);

  const projectName = String(req.body?.name || file.name?.replace(/\.zip$/i, "") || "app");
  const rawSlug    = String(req.body?.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
  const slug       = rawSlug || `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36)}`;
  const origin     = getPublicUrl(req);
  const envOverride: Record<string, string> = (() => {
    try { const e = req.body?.env; return e ? (typeof e === "string" ? JSON.parse(e) : e) : {}; } catch { return {}; }
  })();

  const job = deployQueue.enqueue(slug, projectName, async (log) => {
    const work = await mkdtemp(path.join(tmpdir(), "nezora-zip-"));
    try {
      log(`Extracting ZIP (${sizeMb.toFixed(1)} MB)...`);
      const extractDir = path.join(work, "extract");
      await mkdir(extractDir, { recursive: true });
      safeExtract(fileBuffer, extractDir);
      const sourceDir = await normalizeRoot(extractDir);
      const fileCount = (await readdir(sourceDir).catch(() => [])).length;
      if (fileCount === 0) throw new Error("ZIP is empty — no files found after extraction.");
      log(`Extracted ${fileCount} files/directories at root.`);
      return await deployApp({ sourceDir, name: projectName, slug, log, origin, envOverride });
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  });

  res.json({ ok: true, jobId: job.id, slug, message: "Deploy queued." });
});

// ── POST /api/real/app-deploy/git ─────────────────────────────────────────

router.post("/real/app-deploy/git", async (req, res) => {
  if (!assertAdmin(req, res)) return;

  const { url, branch = "main", name, token, slug: rawSlug } = req.body ?? {};
  if (!url) { res.status(400).json({ ok: false, message: "url is required." }); return; }

  const projectName = name || url.split("/").pop()?.replace(/\.git$/, "") || "app";
  const customSlug  = String(rawSlug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
  const slug        = customSlug || `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36)}`;
  const origin      = getPublicUrl(req);

  // Build authenticated URL
  let cloneUrl = url;
  if (token && !url.includes("@")) {
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      u.username = token;
      cloneUrl = u.toString();
    } catch { /* malformed url */ }
  }

  const envOverride: Record<string, string> = (() => {
    try { const e = req.body?.env; return e ? (typeof e === "string" ? JSON.parse(e) : e) : {}; } catch { return {}; }
  })();

  const job = deployQueue.enqueue(slug, projectName, async (log) => {
    const work = await mkdtemp(path.join(tmpdir(), "nezora-git-"));
    try {
      log(`Cloning ${url} (branch: ${branch})...`);

      // Try the requested branch first, then fall back to default
      let cloneResult = await runCmd("git", ["clone", "--depth=1", "--branch", branch, cloneUrl, "repo"], work, BUILD_ENV, 5 * 60 * 1000);
      if (cloneResult.code !== 0) {
        log(`Branch '${branch}' not found — trying default branch...`);
        cloneResult = await runCmd("git", ["clone", "--depth=1", cloneUrl, "repo"], work, BUILD_ENV, 5 * 60 * 1000);
        if (cloneResult.code !== 0) {
          throw new Error(`git clone failed: ${cloneResult.stderr.slice(0, 500)}`);
        }
      }
      log("Clone complete.");

      const sourceDir = path.join(work, "repo");

      // Inject env as .env file
      if (Object.keys(envOverride).length > 0) {
        const envLines = Object.entries(envOverride).map(([k, v]) => `${k}=${v}`).join("\n");
        await writeFile(path.join(sourceDir, ".env"), envLines);
        log(`Injected ${Object.keys(envOverride).length} env variable(s) into .env`);
      }

      return await deployApp({ sourceDir, name: projectName, slug, log, origin, envOverride });
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  });

  res.json({ ok: true, jobId: job.id, slug, message: "Deploy queued." });
});

// ── GET /api/real/deploy-jobs/:id ─────────────────────────────────────────

router.get("/real/deploy-jobs/:id", async (req, res) => {
  const job = deployQueue.get(req.params.id);
  if (!job) { res.status(404).json({ ok: false, message: "Job not found" }); return; }
  res.json({ ok: true, job: { id: job.id, status: job.status, logs: job.logs, result: job.result, error: job.error, createdAt: job.createdAt } });
});

// ── GET /api/real/deploy-jobs ─────────────────────────────────────────────

router.get("/real/deploy-jobs", async (_req, res) => {
  const jobs = deployQueue.list().map(j => ({ id: j.id, status: j.status, name: j.name, slug: j.slug, createdAt: j.createdAt, error: j.error }));
  res.json({ ok: true, jobs });
});

export default router;
