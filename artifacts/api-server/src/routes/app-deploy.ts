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
import { detectPackageManager } from "../lib/stack-detector";

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
      const isWorker = getAppKind(entry.framework) === "worker";
      await processManager.spawn({
        id: entry.id, name: entry.name, command: entry.command,
        args: entry.args, cwd: entry.cwd, env: entry.env,
        framework: entry.framework, language: entry.language,
        port: isWorker ? 0 : undefined,
      });
      console.log(`[restore] Started: ${entry.name} (${entry.id}) ${isWorker ? "[worker]" : ""}`);
    } catch (e) { console.warn(`[restore] Failed to restart ${entry.id}:`, e); }
  }
}

function run(command: string, args: readonly string[], cwd: string, timeoutMs = 15 * 60 * 1000) {
  return new Promise<{ command: string; code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(command, args, {
      cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, CI: "true", NODE_ENV: "production", npm_config_user_agent: "npm" },
    }, (error, stdout, stderr) => {
      const rawCode = (error as any)?.code;
      const code = typeof rawCode === "number" ? rawCode : error ? 127 : 0;
      resolve({ command: [command, ...args].join(" "), code, stdout: stdout.slice(0, 8000), stderr: (stderr || String(error?.message || "")).slice(0, 8000) });
    });
  });
}

/**
 * Rewrite all "workspace:*" / "workspace:^x.y.z" / "workspace:~x.y.z" dependency
 * entries in every package.json found at `dir` (root only, not recursive into node_modules).
 * This makes the project installable with plain npm outside its original monorepo.
 * Also removes pnpm-lock.yaml to prevent the detected package manager from being pnpm.
 */
async function sanitizeWorkspaceDeps(dir: string, log: (m: string) => void): Promise<boolean> {
  let patched = false;
  const pkgPath = path.join(dir, "package.json");
  try {
    const raw = await readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    const sections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
    let changed = false;
    for (const section of sections) {
      if (!pkg[section]) continue;
      for (const [key, val] of Object.entries(pkg[section] as Record<string, string>)) {
        if (typeof val === "string" && val.startsWith("workspace:")) {
          // Replace "workspace:*" / "workspace:^1.0.0" etc with "*"
          pkg[section][key] = "*";
          changed = true;
        }
      }
    }
    if (changed) {
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2));
      log("Rewrote workspace: protocol deps in package.json to * for standalone install");
      patched = true;
    }
  } catch { /* no package.json or parse error — ignore */ }

  // Remove pnpm lockfile so npm is used instead (pnpm workspace: deps would still fail with pnpm outside a workspace)
  const lockPath = path.join(dir, "pnpm-lock.yaml");
  try {
    await unlink(lockPath);
    log("Removed pnpm-lock.yaml (workspace mode incompatible outside monorepo)");
  } catch { /* lock file may not exist */ }

  return patched;
}

async function runInstall(sourceDir: string, pm: string, log: (m: string) => void): Promise<void> {
  const cleanEnv = { ...process.env, CI: "true", NODE_ENV: "production" };
  delete (cleanEnv as any).npm_config_user_agent;

  const tryCmd = async (cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
    return new Promise((resolve) => {
      execFile(cmd, args, {
        cwd: sourceDir, timeout: 15 * 60 * 1000, maxBuffer: 32 * 1024 * 1024,
        env: cleanEnv,
      }, (error, stdout, stderr) => {
        const rawCode = (error as any)?.code;
        const code = typeof rawCode === "number" ? rawCode : error ? 127 : 0;
        resolve({ code, stdout: stdout.slice(0, 8000), stderr: (stderr || String(error?.message || "")).slice(0, 8000) });
      });
    });
  };

  // Always sanitize workspace: protocol deps before attempting any install.
  // This is critical for pnpm monorepo sub-packages deployed standalone.
  await sanitizeWorkspaceDeps(sourceDir, log);

  // After sanitizing, re-check which package manager to use.
  // If pnpm was detected because of pnpm-workspace.yaml but pnpm-lock.yaml is now gone,
  // fall through to npm which handles the rewritten deps cleanly.
  const rootFiles = await readdir(sourceDir).catch(() => [] as string[]);
  const actualPm = detectPackageManager(rootFiles);

  if (actualPm === "pnpm") {
    log("Installing dependencies (pnpm)...");
    const r = await tryCmd("pnpm", ["install", "--no-frozen-lockfile"]);
    if (r.code === 0) { log("Dependencies installed."); return; }
    log(`pnpm failed: ${(r.stderr || r.stdout).slice(0, 200)} — trying npm fallback...`);
  }

  if (actualPm === "yarn") {
    log("Installing dependencies (yarn)...");
    const r = await tryCmd("yarn", ["install", "--non-interactive"]);
    if (r.code === 0) { log("Dependencies installed."); return; }
    log("yarn failed, falling back to npm...");
  }

  if (actualPm === "bun") {
    log("Installing dependencies (bun)...");
    const r = await tryCmd("bun", ["install"]);
    if (r.code === 0) { log("Dependencies installed."); return; }
    log("bun failed, falling back to npm...");
  }

  // npm with progressive fallbacks
  log("Installing dependencies (npm)...");
  let r = await tryCmd("npm", ["install", "--production=false"]);
  if (r.code === 0) { log("Dependencies installed."); return; }

  log("npm install failed, trying --legacy-peer-deps...");
  r = await tryCmd("npm", ["install", "--legacy-peer-deps"]);
  if (r.code === 0) { log("Dependencies installed."); return; }

  log("--legacy-peer-deps failed, trying --force...");
  r = await tryCmd("npm", ["install", "--force"]);
  if (r.code === 0) { log("Dependencies installed."); return; }

  throw new Error(`Install failed: ${(r.stderr || r.stdout).slice(0, 500)}`);
}

async function walk(dir: string, root = dir): Promise<string[]> {
  const entries = await readdir(dir).catch(() => []);
  const out: string[] = [];
  for (const e of entries) {
    if ([".git", "node_modules", ".next", "dist", "build", "__pycache__", ".venv", ".yarn"].includes(e)) continue;
    const full = path.join(dir, e);
    const s = await stat(full).catch(() => null);
    if (!s) continue;
    if (s.isDirectory()) out.push(...await walk(full, root));
    else out.push(path.relative(root, full));
    if (out.length > 8000) break;
  }
  return out;
}

async function readOptional(file: string) {
  try { return await readFile(file, "utf8"); } catch { return undefined; }
}

async function readJson(p: string): Promise<any> {
  try { return JSON.parse(await readFile(p, "utf8")); } catch { return null; }
}

function detectFramework(files: string[], pkg?: any): string {
  const dep = (n: string) => Boolean(pkg?.dependencies?.[n] || pkg?.devDependencies?.[n]);
  if (dep("discord.js") || dep("@discordjs/rest") || dep("discord-api-types") || dep("eris") || dep("oceanic.js")) return "discord-bot";
  if (dep("telegraf") || dep("node-telegram-bot-api") || dep("grammy") || dep("telebot") || dep("telegramsjs")) return "telegram-bot";
  if (dep("twitter-api-v2") || dep("twit") || dep("twitter") || dep("twitter-lite")) return "twitter-bot";
  if (dep("whatsapp-web.js") || dep("@whiskeysockets/baileys") || dep("baileys") || dep("@adiwajshing/baileys")) return "whatsapp-bot";
  if (dep("tmi.js") || dep("twitch.js") || dep("@twurple/api")) return "twitch-bot";
  if (dep("node-cron") || dep("agenda") || dep("bull") || dep("bullmq") || dep("bee-queue")) {
    if (!dep("express") && !dep("fastify") && !dep("koa") && !dep("hapi")) return "node-worker";
  }
  if (dep("next")) return "nextjs";
  if (dep("@nuxtjs/nuxt") || dep("nuxt") || dep("nuxt3")) return "nuxt";
  if (dep("vite") && dep("react")) return "react-vite";
  if (dep("vite") && dep("vue")) return "vue";
  if (dep("astro")) return "astro";
  if (dep("@sveltejs/kit") || dep("svelte")) return "svelte";
  if (dep("express")) return "node-express";
  if (dep("fastify") || dep("hapi") || dep("@hapi/hapi") || dep("koa")) return "node-server";
  const filenames = files.map(f => path.basename(f).toLowerCase());
  if (filenames.some(f => ["bot.js", "bot.ts", "bot.mjs"].includes(f))) return "node-worker";
  if (files.some(f => /requirements\.txt$/.test(f)) || files.some(f => /^(main|app|server|bot)\.py$/.test(f))) return "python";
  if (files.some(f => /^Gemfile$/.test(f))) return "ruby";
  if (files.some(f => /^go\.mod$/.test(f))) return "go";
  if (files.some(f => /^Cargo\.toml$/.test(f))) return "rust";
  if (!pkg) {
    if (files.some(f => /^(index|main)\.html$/.test(f)) || files.some(f => /\.(html|htm)$/.test(f))) return "static";
  }
  if (files.some(f => /^(server|index|app|main)\.(js|ts|mjs|cjs)$/.test(f))) return "node-server";
  if (pkg) return "node-server";
  return "unknown";
}

function getAppKind(framework: string): "web" | "worker" | "static" {
  if (["discord-bot", "telegram-bot", "twitter-bot", "whatsapp-bot", "twitch-bot", "node-worker"].includes(framework)) return "worker";
  if (["react-vite", "vue", "astro", "svelte", "static"].includes(framework)) return "static";
  return "web";
}

function pmBin(pm: string) { return pm === "pnpm" ? "pnpm" : pm === "yarn" ? "yarn" : pm === "bun" ? "bun" : "npm"; }

function getBuildCmds(framework: string, pkg?: any, pm = "npm") {
  const s = (n: string) => pkg?.scripts?.[n];
  const run = (script: string) => `${pmBin(pm)} run ${script}`;
  const install = pm === "pnpm" ? "pnpm install --no-frozen-lockfile" : pm === "yarn" ? "yarn install --non-interactive" : pm === "bun" ? "bun install" : "npm install --production=false --legacy-peer-deps";
  switch (framework) {
    case "nextjs": case "nuxt": return { install, build: s("build") ? run("build") : `${pmBin(pm)} run build`, output: framework === "nuxt" ? ".output" : ".next" };
    case "react-vite": case "vue": case "astro": case "svelte":
      return { install, build: s("build") ? run("build") : "vite build", output: "dist" };
    case "node-express": case "node-server":
    case "discord-bot": case "telegram-bot": case "twitter-bot":
    case "whatsapp-bot": case "twitch-bot": case "node-worker":
      return { install, build: s("build") ? run("build") : null, output: "." };
    case "python": return { install: "pip install -r requirements.txt --no-cache-dir", build: null, output: "." };
    case "ruby": return { install: "bundle install", build: null, output: "." };
    case "go": return { install: "go mod download", build: "go build -o _app .", output: "." };
    case "rust": return { install: null, build: "cargo build --release", output: "." };
    case "static": return { install: null, build: null, output: "." };
    default: return { install: pkg ? install : null, build: s("build") ? run("build") : null, output: "." };
  }
}

async function getRealStartCmd(
  appDir: string, framework: string, pkg: any, pm = "npm",
): Promise<{ cmd: string; args: string[] }> {
  const bin = pmBin(pm);
  const scripts: Record<string, string> = pkg?.scripts ?? {};
  const startScript: string | undefined = scripts.start;

  if (startScript && !startScript.includes("react-scripts") && !startScript.includes("vite preview")) {
    if (/^(node|node\.|python3?|bun|deno|ruby|php)\s+/.test(startScript.trim())) {
      const parts = startScript.trim().split(/\s+/);
      return { cmd: parts[0], args: parts.slice(1) };
    }
    return { cmd: bin, args: ["run", "start"] };
  }

  const exists = async (rel: string) => {
    try { await stat(path.join(appDir, rel)); return true; } catch { return false; }
  };

  switch (framework) {
    case "nextjs":
      return { cmd: bin, args: ["run", scripts.start ? "start" : "start"] };
    case "python": {
      for (const f of ["main.py", "app.py", "server.py", "bot.py", "index.py"]) {
        if (await exists(f)) return { cmd: "python3", args: [f] };
      }
      return { cmd: "python3", args: ["app.py"] };
    }
    case "ruby": {
      if (await exists("config/application.rb")) return { cmd: "bundle", args: ["exec", "rails", "server", "-b", "0.0.0.0", "-p", "$PORT"] };
      return { cmd: "ruby", args: ["app.rb"] };
    }
    case "go":
      return { cmd: "./_app", args: [] };
    case "rust": {
      if (pkg?.name) return { cmd: `./target/release/${pkg.name}`, args: [] };
      return { cmd: "./target/release/app", args: [] };
    }
    default: {
      if (pkg?.main && await exists(pkg.main)) return { cmd: "node", args: [pkg.main] };
      for (const f of ["dist/index.js", "dist/server.js", "dist/app.js", "dist/main.js", "server.js", "index.js", "app.js", "main.js", "bot.js", "src/index.js"]) {
        if (await exists(f)) return { cmd: "node", args: [f] };
      }
      return { cmd: "node", args: ["index.js"] };
    }
  }
}

async function normalizeRoot(dir: string) {
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

async function cpExcludeNodeModules(src: string, dest: string): Promise<void> {
  const SKIP = new Set(["node_modules", ".git", ".pnp", ".yarn/cache", ".yarn/unplugged"]);
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    if (SKIP.has(entry.name)) return;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await cpExcludeNodeModules(srcPath, destPath);
    } else {
      await cp(srcPath, destPath);
    }
  }));
}

async function runBuild(dir: string, buildCmd: string, log: (m: string) => void): Promise<void> {
  log(`Building (${buildCmd})...`);
  const parts = buildCmd.trim().split(/\s+/);
  const result = await new Promise<{ code: number; out: string }>((resolve) => {
    execFile(parts[0], parts.slice(1), {
      cwd: dir, shell: true, timeout: 20 * 60 * 1000, maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, CI: "true", NODE_ENV: "production" },
    }, (error, stdout, stderr) => {
      const rawCode = (error as any)?.code;
      const code = typeof rawCode === "number" ? rawCode : error ? 127 : 0;
      resolve({ code, out: (stderr || stdout || String(error?.message || "")).slice(0, 8000) });
    });
  });
  if (result.code !== 0) throw new Error(`Build failed (exit ${result.code}): ${result.out.slice(0, 500)}`);
  log("Build complete.");
}

async function deployApp(opts: {
  sourceDir: string; name: string; slug: string;
  framework: string; files: string[]; pkg?: any;
  log: (m: string) => void; origin: string;
}) {
  const { sourceDir, name, slug, framework, log, origin } = opts;

  const pkg = await readJson(path.join(sourceDir, "package.json")) ?? opts.pkg;

  const rootFiles = await readdir(sourceDir).catch(() => [] as string[]);
  const pm = detectPackageManager(rootFiles);
  log(`Package manager: ${pm}`);

  const appKind = getAppKind(framework);
  log(`App type: ${framework} (${appKind})`);

  const cmds = getBuildCmds(framework, pkg, pm);

  if (appKind === "static") {
    if (cmds.install) {
      await runInstall(sourceDir, pm, log);
    }
    if (cmds.build) {
      await runBuild(sourceDir, cmds.build, log);
    }
    const { LOCAL_SITE_ROOT } = await import("./static-serve");
    const siteDest = path.join(LOCAL_SITE_ROOT, slug);
    await rm(siteDest, { recursive: true, force: true });
    await mkdir(siteDest, { recursive: true });
    const outputSrc = (cmds.output === "." || !cmds.output) ? sourceDir : path.join(sourceDir, cmds.output);
    const outStat = await stat(outputSrc).catch(() => null);
    if (!outStat?.isDirectory()) {
      log(`Output dir '${cmds.output}' not found — serving root files.`);
      await cp(sourceDir, siteDest, { recursive: true });
    } else {
      await cp(outputSrc, siteDest, { recursive: true });
    }
    const idxPath = path.join(siteDest, "index.html");
    const hasIndex = await stat(idxPath).then(s => s.isFile()).catch(() => false);
    if (!hasIndex) {
      const htmlFile = (await walk(siteDest)).find(f => f.endsWith(".html"));
      if (!htmlFile) log(`No index.html found — files copied but site may not load.`);
    }
    const siteUrl = `${origin}/api/s/${slug}/`;
    const sitesCat = await loadSitesCatalog();
    sitesCat[slug] = { ...(sitesCat[slug] ?? {}), slug, name, url: siteUrl, framework, type: "static", createdAt: sitesCat[slug]?.createdAt ?? Date.now(), updatedAt: Date.now() } as any;
    await saveSitesCatalog(sitesCat).catch(() => {});
    log(`Static site live at ${siteUrl}`);
    return { type: "static-site", slug, url: siteUrl, framework };
  }

  const appDest = path.join(APP_ROOT, slug);
  await mkdir(APP_ROOT, { recursive: true });
  await rm(appDest, { recursive: true, force: true });

  log(`Copying source files to ${path.basename(appDest)}...`);
  await cpExcludeNodeModules(sourceDir, appDest);

  if (cmds.install) {
    await runInstall(appDest, pm, log);
  }

  if (cmds.build) {
    await runBuild(appDest, cmds.build, log);
  }

  const startCmd = await getRealStartCmd(appDest, framework, pkg, pm);
  log(`Starting: ${startCmd.cmd} ${startCmd.args.join(" ")}`);

  if (appKind === "worker") {
    await processManager.spawn({
      id: slug, name, command: startCmd.cmd, args: startCmd.args,
      cwd: appDest, port: 0, framework, language: "javascript",
    });
    const cat = await loadCatalog();
    cat[slug] = { id: slug, name, command: startCmd.cmd, args: startCmd.args, cwd: appDest, env: {}, framework, language: "javascript", createdAt: Date.now() };
    await saveCatalog(cat);
    log(`Worker is running (background process — no URL)`);
    return { type: "worker", slug, url: null, framework };
  }

  await processManager.spawn({
    id: slug, name, command: startCmd.cmd, args: startCmd.args,
    cwd: appDest, framework, language: "javascript",
  });
  const appUrl = `${origin}/app/${slug}/`;
  processManager.updateUrl(slug, appUrl);

  const cat = await loadCatalog();
  cat[slug] = { id: slug, name, command: startCmd.cmd, args: startCmd.args, cwd: appDest, env: {}, framework, language: "javascript", createdAt: Date.now() };
  await saveCatalog(cat);

  log(`Live at ${appUrl}`);
  return { type: "live-app", slug, url: appUrl, framework };
}

// POST /api/real/app-deploy/zip
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

  const job = deployQueue.enqueue(slug, projectName, async (log) => {
    const work = await mkdtemp(path.join(tmpdir(), "nezora-app-zip-"));
    try {
      log(`Extracting ZIP (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB)...`);
      const extractDir = path.join(work, "extract");
      await mkdir(extractDir, { recursive: true });
      safeExtract(fileBuffer, extractDir);
      const sourceDir = await normalizeRoot(extractDir);
      const files = await walk(sourceDir);
      const packageText = await readOptional(path.join(sourceDir, "package.json"));
      const pkg = packageText ? JSON.parse(packageText) : undefined;
      const framework = detectFramework(files, pkg);
      log(`Detected: ${framework}`);
      return await deployApp({ sourceDir, name: projectName, slug, framework, files, pkg, log, origin });
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  });

  res.json({ ok: true, jobId: job.id, slug, message: "Deploy queued — poll /api/real/deploy-jobs/:id for status and URL." });
});

// POST /api/real/app-deploy/git
router.post("/real/app-deploy/git", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { url, branch = "main", name, token, slug: rawSlug } = req.body;
  if (!url) { res.status(400).json({ ok: false, message: "url is required." }); return; }
  const projectName = name || url.split("/").pop()?.replace(/\.git$/, "") || "app";
  const customSlug = String(rawSlug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
  const slug = customSlug || `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36)}`;
  const origin = getPublicUrl(req);

  let cloneUrl = url;
  if (token && !url.includes("@")) {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    u.username = token;
    cloneUrl = u.toString();
  }

  const job = deployQueue.enqueue(slug, projectName, async (log) => {
    const work = await mkdtemp(path.join(tmpdir(), "nezora-app-git-"));
    try {
      log(`Cloning ${url} (branch: ${branch})...`);
      const cloneResult = await run("git", ["clone", "--depth=1", "--branch", branch, cloneUrl, "repo"], work, 5 * 60 * 1000);
      if (cloneResult.code !== 0) {
        log(`Branch '${branch}' not found, trying default branch...`);
        const r2 = await run("git", ["clone", "--depth=1", cloneUrl, "repo"], work, 5 * 60 * 1000);
        if (r2.code !== 0) throw new Error(`git clone failed: ${r2.stderr.slice(0, 300)}`);
      }
      log("Clone complete.");
      const sourceDir = path.join(work, "repo");
      const files = await walk(sourceDir);
      const packageText = await readOptional(path.join(sourceDir, "package.json"));
      const pkg = packageText ? JSON.parse(packageText) : undefined;
      const framework = detectFramework(files, pkg);
      log(`Detected: ${framework}`);

      const envBody = req.body?.env;
      const envOverride: Record<string, string> = (typeof envBody === "string" ? JSON.parse(envBody) : envBody) ?? {};
      if (Object.keys(envOverride).length > 0) {
        const envLines = Object.entries(envOverride).map(([k, v]) => `${k}=${v}`).join("\n");
        await writeFile(path.join(sourceDir, ".env"), envLines);
        log(`Injected ${Object.keys(envOverride).length} environment variable(s).`);
      }

      return await deployApp({ sourceDir, name: projectName, slug, framework, files, pkg, log, origin });
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  });

  res.json({ ok: true, jobId: job.id, slug, message: "Deploy queued." });
});

// GET /api/real/deploy-jobs/:id
router.get("/real/deploy-jobs/:id", async (req, res) => {
  const job = deployQueue.get(req.params.id);
  if (!job) { res.status(404).json({ ok: false, message: "Job not found" }); return; }
  res.json({ ok: true, job: { id: job.id, status: job.status, logs: job.logs, result: job.result, error: job.error, createdAt: job.createdAt } });
});

// GET /api/real/deploy-jobs (list all)
router.get("/real/deploy-jobs", async (_req, res) => {
  const jobs = deployQueue.list().map(j => ({ id: j.id, status: j.status, name: j.name, slug: j.slug, createdAt: j.createdAt, error: j.error }));
  res.json({ ok: true, jobs });
});

export default router;
