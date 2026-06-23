import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";
import { processManager } from "../lib/process-manager";
import { deployQueue } from "../lib/deploy-queue";
import { getPublicUrl } from "../lib/platform";
import { execFile } from "child_process";
import AdmZip from "adm-zip";
import path from "path";
import { mkdtemp, rm, readdir, stat, cp, readFile, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { loadSitesCatalog, saveSitesCatalog } from "./sites";

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
      if (!(await stat(entry.cwd).then(s => s.isDirectory()).catch(() => false))) continue;
      await processManager.spawn({
        id: entry.id, name: entry.name, command: entry.command,
        args: entry.args, cwd: entry.cwd, env: entry.env,
        framework: entry.framework, language: entry.language,
      });
      console.log(`[restore] Started: ${entry.name} (${entry.id})`);
    } catch (e) { console.warn(`[restore] Failed to restart ${entry.id}:`, e); }
  }
}

function run(command: string, args: readonly string[], cwd: string, timeoutMs = 15 * 60 * 1000) {
  return new Promise<{ command: string; code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(command, args, {
      cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, CI: "true", NODE_ENV: "production" },
    }, (error, stdout, stderr) => {
      const rawCode = (error as any)?.code;
      const code = typeof rawCode === "number" ? rawCode : error ? 127 : 0;
      resolve({ command: [command, ...args].join(" "), code, stdout: stdout.slice(0, 8000), stderr: (stderr || String(error?.message || "")).slice(0, 8000) });
    });
  });
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

function detectFramework(files: string[], pkg?: any): string {
  const dep = (n: string) => Boolean(pkg?.dependencies?.[n] || pkg?.devDependencies?.[n]);
  if (dep("next")) return "nextjs";
  if (dep("vite") && dep("react")) return "react-vite";
  if (dep("vite") && dep("vue")) return "vue";
  if (dep("astro")) return "astro";
  if (dep("fastify") || dep("hapi") || dep("koa")) return "node-server";
  if (dep("express")) return "node-express";
  if (files.some(f => /^(server|index|app)\.(js|ts|mjs|cjs)$/.test(f))) return "node-server";
  if (files.some(f => /requirements\.txt$/.test(f)) || files.some(f => /^(main|app|server)\.py$/.test(f))) return "python";
  if (files.some(f => /^Gemfile$/.test(f))) return "ruby";
  if (files.some(f => /^go\.mod$/.test(f))) return "go";
  if (files.some(f => /^(index|main)\.html$/.test(f))) return "static";
  if (files.some(f => /\.(html|htm)$/.test(f))) return "static";
  return "unknown";
}

function isServerApp(framework: string): boolean {
  return ["node-express", "node-server", "nextjs", "python", "ruby", "go"].includes(framework);
}

function getBuildCmds(framework: string, pkg?: any) {
  const s = (n: string) => pkg?.scripts?.[n];
  switch (framework) {
    case "nextjs": return { install: "npm ci", build: s("build") || "next build", output: ".next" };
    case "react-vite": case "vue": case "astro":
      return { install: "npm ci", build: s("build") || "vite build", output: "dist" };
    case "node-express": case "node-server":
      return { install: "npm ci", build: s("build") || "echo no-build", output: "." };
    case "python": return { install: "pip install -r requirements.txt", build: "echo no-build", output: "." };
    case "static": return { install: "n/a", build: "n/a", output: "." };
    default: return { install: pkg ? "npm ci" : "n/a", build: s("build") || "echo no-build", output: "." };
  }
}

function getStartCmd(framework: string, pkg?: any, files: string[] = []): { cmd: string; args: string[] } {
  const start = pkg?.scripts?.start;
  if (start && !start.includes("react-scripts") && !start.includes("vite")) {
    const parts = start.split(" ");
    return { cmd: parts[0], args: parts.slice(1) };
  }
  switch (framework) {
    case "nextjs": return { cmd: "npx", args: ["next", "start", "-p", "${PORT}"] };
    case "node-express": case "node-server": {
      const main = pkg?.main;
      if (main) return { cmd: "node", args: [main] };
      for (const f of ["dist/index.js", "dist/server.js", "server.js", "index.js", "app.js"]) {
        if (files.includes(f) || files.includes(f.replace(/^dist\//, ""))) return { cmd: "node", args: [f] };
      }
      return { cmd: "node", args: ["index.js"] };
    }
    case "python": {
      if (files.includes("main.py")) return { cmd: "python", args: ["main.py"] };
      if (files.includes("app.py")) return { cmd: "python", args: ["app.py"] };
      return { cmd: "python", args: ["server.py"] };
    }
    default: return { cmd: "node", args: ["index.js"] };
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

async function deployApp(opts: {
  sourceDir: string; name: string; slug: string;
  framework: string; files: string[]; pkg?: any;
  log: (m: string) => void; origin: string;
}) {
  const { sourceDir, name, slug, framework, files, pkg, log, origin } = opts;
  const cmds = getBuildCmds(framework, pkg);

  if (cmds.install !== "n/a") {
    log(`📦 Installing dependencies (${cmds.install})…`);
    const [cmd, ...args] = cmds.install.split(" ");
    let r = await run(cmd, args, sourceDir);
    if (r.code !== 0) {
      log(`⚠️  ${cmd} failed, trying npm install…`);
      r = await run("npm", ["install"], sourceDir);
      if (r.code !== 0) throw new Error(`Install failed: ${r.stderr.slice(0, 500)}`);
    }
    log("✅ Dependencies installed.");
  }

  if (cmds.build !== "n/a" && !cmds.build.startsWith("echo")) {
    log(`🔨 Building (${cmds.build})…`);
    const [cmd, ...args] = cmds.build.split(" ");
    const r = await run(cmd, args, sourceDir);
    if (r.code !== 0) throw new Error(`Build failed: ${r.stderr.slice(0, 500)}`);
    log("✅ Build complete.");
  }

  if (isServerApp(framework)) {
    const appDest = path.join(APP_ROOT, slug);
    await mkdir(APP_ROOT, { recursive: true });
    await rm(appDest, { recursive: true, force: true });
    await cp(sourceDir, appDest, { recursive: true });

    const startCmd = getStartCmd(framework, pkg, files);
    log(`🚀 Starting: ${startCmd.cmd} ${startCmd.args.join(" ")}`);

    await processManager.spawn({
      id: slug, name, command: startCmd.cmd, args: startCmd.args,
      cwd: appDest, framework, language: framework,
    });

    const appUrl = `${origin}/app/${slug}/`;
    processManager.updateUrl(slug, appUrl);

    const cat = await loadCatalog();
    cat[slug] = {
      id: slug, name, command: startCmd.cmd, args: startCmd.args,
      cwd: appDest, env: {}, framework, language: framework, createdAt: Date.now(),
    };
    await saveCatalog(cat);

    log(`✅ Live at ${appUrl}`);
    return { type: "live-app", slug, url: appUrl, framework };
  } else {
    const { LOCAL_SITE_ROOT } = await import("./static-serve");
    const siteDest = path.join(LOCAL_SITE_ROOT, slug);
    log(`📁 Copying files to site store…`);
    await mkdir(siteDest, { recursive: true });
    await rm(siteDest, { recursive: true, force: true });
    await mkdir(siteDest, { recursive: true });
    const outputSrc = cmds.output === "." ? sourceDir : path.join(sourceDir, cmds.output);
    // Verify output dir exists before copying
    const outStat = await stat(outputSrc).catch(() => null);
    if (!outStat?.isDirectory()) {
      // Fall back to root of sourceDir
      log(`⚠️  Output dir '${cmds.output}' not found — serving root files.`);
      await cp(sourceDir, siteDest, { recursive: true });
    } else {
      await cp(outputSrc, siteDest, { recursive: true });
    }
    // Verify index.html exists
    const idxPath = path.join(siteDest, "index.html");
    const hasIndex = await stat(idxPath).then(s => s.isFile()).catch(() => false);
    if (!hasIndex) {
      // Find any .html file and warn
      const allFiles = await walk(siteDest);
      const htmlFile = allFiles.find(f => f.endsWith(".html"));
      if (!htmlFile) log(`⚠️  No index.html found — files copied but site may not load.`);
      else log(`⚠️  index.html missing at root — found ${htmlFile} instead.`);
    }
    const siteUrl = `${origin}/api/s/${slug}/`;
    // Record in sites catalog so My Hosted Sites page can list it
    const sitesCat = await loadSitesCatalog();
    sitesCat[slug] = { ...(sitesCat[slug] ?? {}), slug, name, url: siteUrl, framework, type: "static", createdAt: sitesCat[slug]?.createdAt ?? Date.now(), updatedAt: Date.now() } as any;
    await saveSitesCatalog(sitesCat).catch(() => {});
    log(`✅ Static site live at ${siteUrl}`);
    return { type: "static-site", slug, url: siteUrl, framework };
  }
}

// POST /api/real/app-deploy/zip
router.post("/real/app-deploy/zip", async (req: any, res) => {
  if (!assertAdmin(req, res)) return;
  const file = req.files?.file;
  if (!file) { res.status(400).json({ ok: false, message: "Missing ZIP file." }); return; }
  if ((file.data?.length || file.size || 0) > 200 * 1024 * 1024) {
    res.status(413).json({ ok: false, message: "ZIP too large (max 200MB)." }); return;
  }
  // When useTempFiles:true, file.data is an empty Buffer — must read from disk
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
      log(`📂 Extracting ZIP (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB)…`);
      const extractDir = path.join(work, "extract");
      await mkdir(extractDir, { recursive: true });
      safeExtract(fileBuffer, extractDir);
      const sourceDir = await normalizeRoot(extractDir);
      const files = await walk(sourceDir);
      const packageText = await readOptional(path.join(sourceDir, "package.json"));
      const pkg = packageText ? JSON.parse(packageText) : undefined;
      const framework = detectFramework(files, pkg);
      log(`🔍 Detected: ${framework}`);
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
  const cloneUrl = token ? url.replace("https://", `https://x-access-token:${token}@`) : url;

  const job = deployQueue.enqueue(slug, projectName, async (log) => {
    const work = await mkdtemp(path.join(tmpdir(), "nezora-app-git-"));
    try {
      log(`📡 Cloning ${url} (branch: ${branch})…`);
      const r = await run("git", ["clone", "--depth", "1", "--branch", branch, cloneUrl, "source"], work);
      if (r.code !== 0) throw new Error(`Git clone failed: ${r.stderr.slice(0, 300)}`);
      const sourceDir = path.join(work, "source");
      const files = await walk(sourceDir);
      const packageText = await readOptional(path.join(sourceDir, "package.json"));
      const pkg = packageText ? JSON.parse(packageText) : undefined;
      const framework = detectFramework(files, pkg);
      log(`🔍 Detected: ${framework}`);
      return await deployApp({ sourceDir, name: projectName, slug, framework, files, pkg, log, origin });
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  });

  res.json({ ok: true, jobId: job.id, slug, message: "Deploy queued — poll /api/real/deploy-jobs/:id for status." });
});

// GET /api/real/app-types — supported frameworks
router.get("/real/app-types", (_req, res) => {
  res.json({
    ok: true,
    supported: [
      { framework: "static", label: "Static HTML/CSS/JS", type: "static" },
      { framework: "react-vite", label: "React + Vite", type: "static" },
      { framework: "vue", label: "Vue.js", type: "static" },
      { framework: "astro", label: "Astro", type: "static" },
      { framework: "nextjs", label: "Next.js", type: "live-app" },
      { framework: "node-express", label: "Node.js / Express", type: "live-app" },
      { framework: "node-server", label: "Node.js Server", type: "live-app" },
      { framework: "python", label: "Python (Flask/FastAPI)", type: "live-app" },
    ],
  });
});

export default router;
