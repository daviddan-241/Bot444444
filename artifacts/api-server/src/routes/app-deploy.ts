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
import { createServer } from "net";
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
        console.warn(`[restore] Skipping ${entry.id}: directory missing`);
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
    } catch (e) {
      console.warn(`[restore] Failed: ${entry.id}`, e);
    }
  }
}

// ── Exec helpers ──────────────────────────────────────────────────────────

function runCmd(
  command: string, args: readonly string[], cwd: string,
  env?: Record<string, string>, timeoutMs = 20 * 60 * 1000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(command, args, {
      cwd, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...env },
    }, (error, stdout, stderr) => {
      const code = typeof (error as any)?.code === "number" ? (error as any).code : error ? 127 : 0;
      resolve({ code, stdout: (stdout ?? "").slice(0, 12000), stderr: (stderr || String(error?.message ?? "")).slice(0, 12000) });
    });
  });
}

function runShell(cmd: string, cwd: string, env?: Record<string, string>, timeoutMs = 25 * 60 * 1000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile("sh", ["-c", cmd], {
      cwd, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...env },
    }, (error, stdout, stderr) => {
      const code = typeof (error as any)?.code === "number" ? (error as any).code : error ? 127 : 0;
      resolve({ code, out: (stderr || stdout || String(error?.message ?? "")).slice(0, 12000) });
    });
  });
}

const BUILD_ENV: Record<string, string> = {
  CI: "true", NODE_ENV: "production",
  PYTHONDONTWRITEBYTECODE: "1", PYTHONUNBUFFERED: "1",
  GEM_HOME: "/root/.gem",
};

// ── Archive type detection by magic bytes ─────────────────────────────────

type ArchiveType = "zip" | "gzip" | "bzip2" | "xz" | "zstd" | "tar" | "unknown";

function detectArchiveType(buf: Buffer, filename?: string): ArchiveType {
  // Magic bytes first (most reliable)
  if (buf.length >= 4) {
    // ZIP: PK header
    if (buf[0] === 0x50 && buf[1] === 0x4B && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) return "zip";
    // GZIP
    if (buf[0] === 0x1F && buf[1] === 0x8B) return "gzip";
    // BZIP2
    if (buf[0] === 0x42 && buf[1] === 0x5A && buf[2] === 0x68) return "bzip2";
    // XZ
    if (buf[0] === 0xFD && buf[1] === 0x37 && buf[2] === 0x7A && buf[3] === 0x58) return "xz";
    // Zstandard
    if (buf[0] === 0x28 && buf[1] === 0xB5 && buf[2] === 0x2F && buf[3] === 0xFD) return "zstd";
    // TAR: "ustar" magic at offset 257
    if (buf.length >= 262) {
      const magic = buf.slice(257, 262).toString("ascii");
      if (magic === "ustar") return "tar";
    }
  }
  // Fall back to extension
  if (filename) {
    const f = filename.toLowerCase();
    if (f.endsWith(".zip")) return "zip";
    if (f.endsWith(".tar.gz") || f.endsWith(".tgz")) return "gzip";
    if (f.endsWith(".tar.bz2") || f.endsWith(".tbz2")) return "bzip2";
    if (f.endsWith(".tar.xz") || f.endsWith(".txz")) return "xz";
    if (f.endsWith(".tar.zst")) return "zstd";
    if (f.endsWith(".tar")) return "tar";
  }
  return "unknown";
}

async function extractArchive(buf: Buffer, destDir: string, type: ArchiveType, log: (m: string) => void): Promise<void> {
  if (type === "zip") {
    safeZipExtract(buf, destDir);
    return;
  }

  // Write buffer to temp file, then use system tar
  const tmpFile = path.join(destDir, "_archive_tmp");
  await writeFile(tmpFile, buf);
  await mkdir(destDir, { recursive: true });

  let tarFlag: string;
  switch (type) {
    case "gzip":  tarFlag = "-xzf"; break;
    case "bzip2": tarFlag = "-xjf"; break;
    case "xz":    tarFlag = "-xJf"; break;
    case "zstd":  tarFlag = "--zstd -xf"; break;
    default:      tarFlag = "-xf";  break;
  }

  // Try tar extraction
  const result = await runShell(`tar ${tarFlag} "${tmpFile}" -C "${destDir}"`, destDir, BUILD_ENV, 2 * 60 * 1000);
  await unlink(tmpFile).catch(() => {});

  if (result.code !== 0) {
    // Last resort: try 7z
    const r2 = await runShell(`7z x "${tmpFile}" -o"${destDir}" -y 2>&1 || true`, destDir, BUILD_ENV);
    if (r2.code !== 0) {
      throw new Error(`Archive extraction failed (type: ${type}): ${result.out.slice(0, 300)}`);
    }
    log("Extracted with 7z fallback.");
  }
}

function safeZipExtract(buf: Buffer, dest: string): void {
  const zip    = new AdmZip(buf);
  const target = path.resolve(dest);
  for (const entry of zip.getEntries()) {
    const out = path.resolve(dest, entry.entryName);
    if (!out.startsWith(target + path.sep) && out !== target) throw new Error(`Unsafe ZIP path: ${entry.entryName}`);
    if (entry.header.size > 500 * 1024 * 1024) throw new Error(`Entry too large: ${entry.entryName}`);
  }
  zip.extractAllTo(dest, true);
}

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
  } catch { /* ok */ }
  try { await unlink(path.join(dir, "pnpm-lock.yaml")); } catch { /* ok */ }
}

// ── Comprehensive install runner ──────────────────────────────────────────

async function runInstall(dir: string, stack: StackInfo, log: (m: string) => void): Promise<void> {
  if (!stack.installCmd) return;
  const pm = stack.packageManager;
  log(`Installing dependencies (${pm})...`);

  const attempt = async (cmd: string, args: string[]): Promise<boolean> => {
    const r = await runCmd(cmd, args, dir, BUILD_ENV);
    if (r.code === 0) return true;
    log(`  Attempt failed: ${(r.stderr || r.stdout).replace(/\n/g, " ").slice(0, 350)}`);
    return false;
  };

  // ── Node.js ─────────────────────────────────────────────────────────────
  if (["npm", "pnpm", "yarn", "bun"].includes(pm)) {
    await sanitizeWorkspaceDeps(dir, log);
    const reFiles = await readdir(dir).catch(() => [] as string[]);
    const actualPm = detectPackageManager(reFiles);

    if (actualPm === "pnpm") {
      if (await attempt("pnpm", ["install", "--no-frozen-lockfile"])) { log("Dependencies installed."); return; }
      log("pnpm not found — installing globally...");
      await runCmd("npm", ["install", "-g", "pnpm"], dir, BUILD_ENV);
      if (await attempt("pnpm", ["install", "--no-frozen-lockfile"])) { log("Dependencies installed."); return; }
      log("Falling back to npm...");
    } else if (actualPm === "yarn") {
      if (await attempt("yarn", ["install", "--non-interactive", "--frozen-lockfile=false"])) { log("Dependencies installed."); return; }
      log("Falling back to npm...");
    } else if (actualPm === "bun") {
      if (await attempt("bun", ["install"])) { log("Dependencies installed."); return; }
      log("Falling back to npm...");
    }

    // npm fallback chain
    if (await attempt("npm", ["install", "--production=false"])) { log("Dependencies installed."); return; }
    if (await attempt("npm", ["install", "--legacy-peer-deps"])) { log("Dependencies installed."); return; }
    if (await attempt("npm", ["install", "--force"])) { log("Dependencies installed."); return; }
    throw new Error("npm install failed after all fallbacks — check for invalid packages or workspace: deps in package.json");
  }

  // ── Python ───────────────────────────────────────────────────────────────
  if (pm === "pip" || pm === "uv") {
    // Try uv first (much faster)
    const uvOk = (await runCmd("uv", ["--version"], dir, BUILD_ENV)).code === 0;
    if (uvOk) {
      const hasReqs = (await readdir(dir).catch(() => [])).some(f => f.toLowerCase() === "requirements.txt");
      const uvArgs = hasReqs
        ? ["uv", "pip", "install", "-r", "requirements.txt", "--system"]
        : ["uv", "pip", "install", "-e", ".", "--system"];
      if (await attempt(uvArgs[0], uvArgs.slice(1))) { log("Python dependencies installed (uv)."); return; }
    }
    // pip fallback chain
    const hasReqs = (await readdir(dir).catch(() => [])).some(f => f.toLowerCase() === "requirements.txt");
    const base = hasReqs
      ? ["install", "-r", "requirements.txt", "--no-cache-dir"]
      : ["install", "-e", ".", "--no-cache-dir"];
    for (const bin of ["pip3", "pip"]) {
      if (await attempt(bin, [...base, "--break-system-packages"])) { log(`Python dependencies installed (${bin}).`); return; }
      if (await attempt(bin, base)) { log(`Python dependencies installed (${bin}).`); return; }
    }
    throw new Error("pip install failed — check requirements.txt for bad package names or version conflicts");
  }

  if (pm === "poetry") {
    if (await attempt("poetry", ["install", "--no-interaction", "--no-ansi"])) { log("Dependencies installed (poetry)."); return; }
    log("Installing poetry via pip...");
    await runCmd("pip3", ["install", "poetry", "--break-system-packages"], dir, BUILD_ENV);
    if (await attempt("poetry", ["install", "--no-interaction", "--no-ansi"])) { log("Dependencies installed (poetry)."); return; }
    throw new Error("poetry install failed");
  }

  if (pm === "pipenv") {
    if (await attempt("pipenv", ["install", "--deploy", "--system"])) { log("Dependencies installed (pipenv)."); return; }
    await runCmd("pip3", ["install", "pipenv", "--break-system-packages"], dir, BUILD_ENV);
    if (await attempt("pipenv", ["install", "--deploy", "--system"])) { log("Dependencies installed (pipenv)."); return; }
    throw new Error("pipenv install failed");
  }

  // ── Ruby ─────────────────────────────────────────────────────────────────
  if (pm === "bundler") {
    if (await attempt("bundle", ["install", "--jobs=4"])) { log("Ruby gems installed."); return; }
    await runCmd("gem", ["install", "bundler", "--no-document"], dir, BUILD_ENV);
    if (await attempt("bundle", ["install", "--jobs=4"])) { log("Ruby gems installed."); return; }
    throw new Error("bundle install failed");
  }

  // ── PHP ───────────────────────────────────────────────────────────────────
  if (pm === "composer") {
    if (await attempt("composer", ["install", "--no-dev", "--optimize-autoloader", "--no-interaction"])) { log("PHP packages installed."); return; }
    throw new Error("composer install failed — check composer.json");
  }

  // ── Go ────────────────────────────────────────────────────────────────────
  if (pm === "go") {
    if (await attempt("go", ["mod", "download"])) { log("Go modules downloaded."); return; }
    if (await attempt("go", ["mod", "tidy"])) { log("Go modules tidied."); return; }
    throw new Error("go mod download failed");
  }

  // ── Java (Maven / Gradle) ─────────────────────────────────────────────────
  if (pm === "maven") {
    const mvn = (await runCmd("sh", ["-c", "test -x ./mvnw && echo y"], dir, BUILD_ENV)).stdout.trim() === "y" ? "./mvnw" : "mvn";
    if (await attempt(mvn, ["dependency:resolve", "-q", "-DskipTests"])) { log("Maven deps resolved."); return; }
  }
  if (pm === "gradle") {
    const g = (await runCmd("sh", ["-c", "test -x ./gradlew && echo y"], dir, BUILD_ENV)).stdout.trim() === "y" ? "./gradlew" : "gradle";
    if (await attempt(g, ["dependencies", "-q"])) { log("Gradle deps resolved."); return; }
  }

  log(`No install handler for '${pm}' — skipping install step`);
}

// ── Build runner ──────────────────────────────────────────────────────────

async function runBuild(dir: string, buildCmd: string, log: (m: string) => void): Promise<void> {
  log(`Build: ${buildCmd}`);
  const r = await runShell(buildCmd, dir, BUILD_ENV, 25 * 60 * 1000);
  if (r.code !== 0) throw new Error(`Build failed (exit ${r.code}): ${r.out.slice(0, 800)}`);
  log("Build complete.");
}

// ── Health check: poll URL until it responds ──────────────────────────────

async function waitForHealth(url: string, log: (m: string) => void, timeoutMs = 45000): Promise<boolean> {
  const start = Date.now();
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
  log(`Health check: polling ${url}...`);
  while (Date.now() - start < timeoutMs) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
      clearTimeout(t);
      const elapsed = Date.now() - start;
      log(`Health check passed: HTTP ${r.status} in ${elapsed}ms`);
      return true;
    } catch {
      await delay(3000);
    }
  }
  log("Health check: app did not respond within 45s — it may still be starting or crashed");
  return false;
}

// ── File copy (skipping junk dirs) ───────────────────────────────────────

const COPY_SKIP = new Set([
  "node_modules", ".git", "__pycache__", ".venv", "venv",
  ".pnp", ".yarn", ".tox", "vendor", ".mypy_cache",
  ".pytest_cache", ".ruff_cache", "target",
]);

async function cpSmart(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  await Promise.all(entries.map(async (e) => {
    if (COPY_SKIP.has(e.name)) return;
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await cpSmart(s, d);
    else await cp(s, d);
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

function parseCmd(startCmd: string): { cmd: string; args: string[] } {
  const parts = startCmd.trim().split(/\s+/);
  return { cmd: parts[0], args: parts.slice(1) };
}

// ── Apply manual override hints to detected stack ─────────────────────────

export interface DeployHints {
  language?: string;
  buildCmd?: string;
  startCmd?: string;
  installCmd?: string;
  port?: number;
}

function applyHints(stack: StackInfo, hints: DeployHints): StackInfo {
  return {
    ...stack,
    language:   hints.language   ?? stack.language,
    buildCmd:   hints.buildCmd   !== undefined ? (hints.buildCmd || null) : stack.buildCmd,
    startCmd:   hints.startCmd   || stack.startCmd,
    installCmd: hints.installCmd !== undefined ? (hints.installCmd || null) : stack.installCmd,
    port:       hints.port       ?? stack.port,
  };
}

// ── Core deploy logic ─────────────────────────────────────────────────────

async function deployApp(opts: {
  sourceDir: string; name: string; slug: string;
  log: (m: string) => void; origin: string;
  envOverride?: Record<string, string>;
  hints?: DeployHints;
}) {
  const { sourceDir, name, slug, log, origin, envOverride = {}, hints = {} } = opts;

  // ── Detect stack ──────────────────────────────────────────────────────
  log("Detecting project stack...");
  let stack = await detectStack(sourceDir);
  stack = applyHints(stack, hints);

  log(`Language    : ${stack.language}`);
  log(`Framework   : ${stack.framework}`);
  log(`Runtime     : ${stack.runtime}`);
  log(`Package mgr : ${stack.packageManager}`);
  log(`App type    : ${stack.appKind} (${stack.framework})`);
  log(`Confidence  : ${stack.confidence}`);
  if (stack.procfile) log(`Procfile    : ${Object.entries(stack.procfile).map(([k, v]) => `${k}: ${v}`).join(" | ")}`);
  if (stack.installCmd)  log(`Install cmd : ${stack.installCmd}`);
  if (stack.buildCmd)    log(`Build cmd   : ${stack.buildCmd}`);
  log(`Start cmd   : ${stack.startCmd}`);
  log(`Detected    : ${stack.detected.join(" | ")}`);

  if (stack.confidence === "low" || stack.framework === "unknown") {
    log("WARNING: Stack detection uncertain. Consider re-deploying with manual hints (language, startCmd, buildCmd) for best results.");
  }

  // ── STATIC SITE PATH ──────────────────────────────────────────────────
  if (stack.appKind === "static") {
    log("Static site — installing and building in source...");
    if (stack.installCmd) await runInstall(sourceDir, stack, log);
    if (stack.buildCmd)   await runBuild(sourceDir, stack.buildCmd, log);

    const { LOCAL_SITE_ROOT } = await import("./static-serve");
    const siteDest = path.join(LOCAL_SITE_ROOT, slug);
    await rm(siteDest, { recursive: true, force: true });
    await mkdir(siteDest, { recursive: true });

    const outputSrc = stack.outputDir ? path.join(sourceDir, stack.outputDir) : sourceDir;
    const outStat   = await stat(outputSrc).catch(() => null);
    if (!outStat?.isDirectory()) {
      log(`Output dir '${stack.outputDir ?? "."}' not found after build — copying project root`);
      await cpSmart(sourceDir, siteDest);
    } else {
      await cp(outputSrc, siteDest, { recursive: true });
    }

    const hasIndex = await stat(path.join(siteDest, "index.html")).then(s => s.isFile()).catch(() => false);
    if (!hasIndex) log("Warning: No index.html in output — site may not render");

    const siteUrl = `${origin}/api/s/${slug}/`;
    const sitesCat = await loadSitesCatalog();
    (sitesCat as any)[slug] = { ...(sitesCat[slug] ?? {}), slug, name, url: siteUrl, framework: stack.framework, type: "static", createdAt: (sitesCat[slug] as any)?.createdAt ?? Date.now(), updatedAt: Date.now() };
    await saveSitesCatalog(sitesCat).catch(() => {});
    log(`Static site live: ${siteUrl}`);
    return { type: "static-site", slug, url: siteUrl, framework: stack.framework };
  }

  // ── LIVE PROCESS / WORKER PATH ────────────────────────────────────────
  const appDest = path.join(APP_ROOT, slug);
  await mkdir(APP_ROOT, { recursive: true });
  await rm(appDest, { recursive: true, force: true });

  log(`Copying source to persistent app directory...`);
  await cpSmart(sourceDir, appDest);

  // Write env vars to .env in the persistent app dir so the process picks them up
  if (Object.keys(envOverride).length > 0) {
    const envContent = Object.entries(envOverride).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
    await writeFile(path.join(appDest, ".env"), envContent);
    log(`Wrote ${Object.keys(envOverride).length} env var(s) to .env`);
  }

  if (stack.installCmd) {
    await runInstall(appDest, stack, log);
  } else {
    log("No dependencies to install.");
  }

  if (stack.buildCmd) {
    await runBuild(appDest, stack.buildCmd, log);
  }

  const { cmd, args } = parseCmd(stack.startCmd);
  log(`Starting: ${cmd} ${args.join(" ")}`);

  const processEnv: Record<string, string> = {
    NODE_ENV: "production",
    PYTHONUNBUFFERED: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    ...envOverride,
  };

  if (stack.appKind === "worker") {
    await processManager.spawn({ id: slug, name, command: cmd, args, cwd: appDest, port: 0, framework: stack.framework, language: stack.language, env: processEnv });
    const cat = await loadCatalog();
    cat[slug] = { id: slug, name, command: cmd, args, cwd: appDest, env: processEnv, framework: stack.framework, language: stack.language, createdAt: Date.now() };
    await saveCatalog(cat);
    log(`Worker running (${stack.framework}) — background process, no HTTP port`);
    return { type: "worker", slug, url: null, framework: stack.framework };
  }

  await processManager.spawn({ id: slug, name, command: cmd, args, cwd: appDest, framework: stack.framework, language: stack.language, env: processEnv });
  const appUrl = `${origin}/app/${slug}/`;
  processManager.updateUrl(slug, appUrl);

  const cat = await loadCatalog();
  cat[slug] = { id: slug, name, command: cmd, args, cwd: appDest, env: processEnv, framework: stack.framework, language: stack.language, createdAt: Date.now() };
  await saveCatalog(cat);

  log(`App started. URL: ${appUrl}`);

  // Health check in background (non-blocking to job result)
  waitForHealth(appUrl, log, 45000).catch(() => {});

  return { type: "live-app", slug, url: appUrl, framework: stack.framework };
}

// ── Route: POST /api/real/app-deploy/upload ───────────────────────────────
// Accepts: .zip, .tar.gz, .tgz, .tar, .tar.bz2, .tar.xz, any archive

router.post("/real/app-deploy/upload", async (req: any, res) => {
  if (!assertAdmin(req, res)) return;

  const file = req.files?.file;
  if (!file) { res.status(400).json({ ok: false, message: "No file uploaded." }); return; }

  const fileBuffer: Buffer = (file.data && file.data.length > 0)
    ? file.data : await readFile(file.tempFilePath);

  const sizeMb = fileBuffer.length / 1024 / 1024;
  if (sizeMb > 300) { res.status(413).json({ ok: false, message: "File too large (max 300 MB)." }); return; }

  const archiveType = detectArchiveType(fileBuffer, file.name);

  const projectName = String(req.body?.name || file.name?.replace(/\.(zip|tar\.gz|tgz|tar\.bz2|tar)$/i, "") || "app");
  const rawSlug     = String(req.body?.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
  const slug        = rawSlug || `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36)}`;
  const origin      = getPublicUrl(req);

  const hints: DeployHints = {};
  if (req.body?.hint_language)   hints.language   = req.body.hint_language;
  if (req.body?.hint_start_cmd)  hints.startCmd   = req.body.hint_start_cmd;
  if (req.body?.hint_build_cmd)  hints.buildCmd   = req.body.hint_build_cmd;
  if (req.body?.hint_install_cmd) hints.installCmd = req.body.hint_install_cmd;
  if (req.body?.hint_port)       hints.port       = Number(req.body.hint_port);

  const envOverride: Record<string, string> = (() => {
    try { const e = req.body?.env; return e ? (typeof e === "string" ? JSON.parse(e) : e) : {}; } catch { return {}; }
  })();

  const job = deployQueue.enqueue(slug, projectName, async (log) => {
    const work = await mkdtemp(path.join(tmpdir(), "nezora-upload-"));
    try {
      log(`Archive type : ${archiveType} (${sizeMb.toFixed(1)} MB)`);
      log(`Extracting ${file.name ?? "file"}...`);

      const extractDir = path.join(work, "extract");
      await mkdir(extractDir, { recursive: true });

      if (archiveType === "unknown") {
        log("Archive type unknown — attempting tar extraction as fallback...");
        await writeFile(path.join(extractDir, "_raw"), fileBuffer);
        const r = await runShell(`tar -xf "${path.join(extractDir, "_raw")}" -C "${extractDir}" 2>&1 || true`, extractDir, BUILD_ENV);
        await unlink(path.join(extractDir, "_raw")).catch(() => {});
        if (r.code !== 0) throw new Error(`Could not extract archive. Supported: .zip .tar.gz .tgz .tar.bz2 .tar.xz .tar`);
      } else {
        await extractArchive(fileBuffer, extractDir, archiveType, log);
      }

      const sourceDir  = await normalizeRoot(extractDir);
      const fileCount  = (await readdir(sourceDir).catch(() => [])).length;
      if (fileCount === 0) throw new Error("Archive is empty — no files found after extraction.");
      log(`Extracted: ${fileCount} root entries`);

      return await deployApp({ sourceDir, name: projectName, slug, log, origin, envOverride, hints });
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  });

  res.json({ ok: true, jobId: job.id, slug, message: "Deploy queued.", archiveType });
});

// ── Route: POST /api/real/app-deploy/zip (legacy alias) ──────────────────

router.post("/real/app-deploy/zip", async (req: any, res) => {
  // Proxy to /upload for backwards compatibility
  req.url = "/real/app-deploy/upload";
  return router.handle(req, res, () => {});
});

// ── Route: POST /api/real/app-deploy/git ─────────────────────────────────

router.post("/real/app-deploy/git", async (req, res) => {
  if (!assertAdmin(req, res)) return;

  const { url, branch = "main", name, token, slug: rawSlug } = req.body ?? {};
  if (!url) { res.status(400).json({ ok: false, message: "url is required." }); return; }

  const projectName = name || url.split("/").pop()?.replace(/\.git$/, "") || "app";
  const customSlug  = String(rawSlug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
  const slug        = customSlug || `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36)}`;
  const origin      = getPublicUrl(req);

  const hints: DeployHints = {};
  if (req.body.hint_language)    hints.language   = req.body.hint_language;
  if (req.body.hint_start_cmd)   hints.startCmd   = req.body.hint_start_cmd;
  if (req.body.hint_build_cmd)   hints.buildCmd   = req.body.hint_build_cmd;
  if (req.body.hint_install_cmd) hints.installCmd = req.body.hint_install_cmd;
  if (req.body.hint_port)        hints.port       = Number(req.body.hint_port);

  let cloneUrl = url;
  if (token && !url.includes("@")) {
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      u.username = token;
      cloneUrl = u.toString();
    } catch { /* malformed */ }
  }

  const envOverride: Record<string, string> = (() => {
    try { const e = req.body?.env; return e ? (typeof e === "string" ? JSON.parse(e) : e) : {}; } catch { return {}; }
  })();

  const job = deployQueue.enqueue(slug, projectName, async (log) => {
    const work = await mkdtemp(path.join(tmpdir(), "nezora-git-"));
    try {
      log(`Cloning ${url} (branch: ${branch})...`);
      let r = await runCmd("git", ["clone", "--depth=1", "--branch", branch, cloneUrl, "repo"], work, BUILD_ENV, 5 * 60 * 1000);
      if (r.code !== 0) {
        log(`Branch '${branch}' not found — trying default branch...`);
        r = await runCmd("git", ["clone", "--depth=1", cloneUrl, "repo"], work, BUILD_ENV, 5 * 60 * 1000);
        if (r.code !== 0) throw new Error(`git clone failed: ${r.stderr.slice(0, 500)}`);
      }
      log("Clone complete.");

      const sourceDir = path.join(work, "repo");

      if (Object.keys(envOverride).length > 0) {
        await writeFile(path.join(sourceDir, ".env"), Object.entries(envOverride).map(([k, v]) => `${k}=${v}`).join("\n"));
        log(`Injected ${Object.keys(envOverride).length} env variable(s) into .env`);
      }

      return await deployApp({ sourceDir, name: projectName, slug, log, origin, envOverride, hints });
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
  res.json({ ok: true, jobs: deployQueue.list().map(j => ({ id: j.id, status: j.status, name: j.name, slug: j.slug, createdAt: j.createdAt, error: j.error })) });
});

export default router;
