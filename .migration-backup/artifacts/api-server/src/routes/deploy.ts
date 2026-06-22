import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";
import { execFile } from "child_process";
import AdmZip from "adm-zip";
import path from "path";
import { mkdtemp, rm, writeFile, readdir, stat, cp, readFile, mkdir } from "fs/promises";
import { tmpdir } from "os";

const router: IRouter = Router();

interface CommandResult { command: string; code: number; stdout: string; stderr: string; }

function run(command: string, args: readonly string[], cwd: string, timeoutMs = 1000 * 60 * 10): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 8, env: { ...process.env, CI: "true" } }, (error, stdout, stderr) => {
      const rawCode = (error as any)?.code;
      const code = typeof rawCode === "number" ? rawCode : error ? 127 : 0;
      const finalStderr = stderr || (error ? String((error as Error).message) : "");
      resolve({ command: [command, ...args].join(" "), code, stdout, stderr: finalStderr });
    });
  });
}

async function walk(dir: string, root = dir): Promise<string[]> {
  const entries = await readdir(dir);
  const out: string[] = [];
  for (const entry of entries) {
    if ([".git", "node_modules", ".next", "dist", "build"].includes(entry)) continue;
    const full = path.join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) out.push(...await walk(full, root));
    else out.push(path.relative(root, full));
  }
  return out.slice(0, 6000);
}

async function readOptional(file: string) {
  try { return await readFile(file, "utf8"); } catch { return undefined; }
}

function detectFramework(files: string[], pkg?: any): string {
  const dep = (name: string) => Boolean(pkg?.dependencies?.[name] || pkg?.devDependencies?.[name]);
  if (dep("next") || files.some(f => /^next\.config\.(mjs|js|ts)$/.test(f))) return "nextjs";
  if (dep("vite") && dep("react")) return "react-vite";
  if (dep("vue")) return "vue";
  if (dep("astro")) return "astro";
  if (dep("express")) return "node-express";
  if (files.some(f => /^(index|server|app)\.(js|ts)$/.test(f))) return "node-express";
  if (files.some(f => /^(index|main)\.py$/.test(f))) return "python";
  if (files.some(f => /^Dockerfile$/.test(f))) return "docker";
  if (files.some(f => /^(index|main)\.html$/.test(f))) return "static";
  return "unknown";
}

function getCommands(framework: string, pkg?: any): { install: string; build: string; output: string } {
  const script = (name: string) => pkg?.scripts?.[name];
  switch (framework) {
    case "nextjs": return { install: "npm ci", build: script("build") ? "npm run build" : "next build", output: ".next" };
    case "react-vite": case "vue": case "astro": return { install: "npm ci", build: script("build") ? "npm run build" : "vite build", output: "dist" };
    case "node-express": return { install: "npm ci", build: script("build") ? "npm run build" : "echo no-build", output: "." };
    case "static": return { install: "n/a", build: "n/a", output: "." };
    default: return { install: "npm ci", build: script("build") ? "npm run build" : "echo no-build", output: "dist" };
  }
}

async function normalizeExtractedRoot(dir: string) {
  const entries = await readdir(dir);
  if (entries.length === 1) {
    const only = path.join(dir, entries[0]);
    if ((await stat(only)).isDirectory()) return only;
  }
  return dir;
}

function safeExtract(zipBuffer: Buffer, dest: string) {
  const zip = new AdmZip(zipBuffer);
  const target = path.resolve(dest);
  for (const entry of zip.getEntries()) {
    const out = path.resolve(dest, entry.entryName);
    if (!out.startsWith(target + path.sep) && out !== target) throw new Error(`Unsafe ZIP path blocked: ${entry.entryName}`);
    if (entry.header.size > 200 * 1024 * 1024) throw new Error(`ZIP entry too large: ${entry.entryName}`);
  }
  zip.extractAllTo(dest, true);
}

const LOCAL_SITE_ROOT = process.env.NEZORA_LOCAL_SITE_ROOT || "/tmp/nezora-sites";

router.post("/real/github-pages", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { token, owner, repo, branch = "main", autoFix = true } = req.body;
  if (!token || !owner || !repo) {
    res.status(400).json({ ok: false, message: "token, owner, and repo are required." });
    return;
  }
  const commands: CommandResult[] = [];
  const work = await mkdtemp(path.join(tmpdir(), "nezora-gh-pages-"));
  const source = path.join(work, "source");
  const remote = `https://x-access-token:${encodeURIComponent(token)}@github.com/${owner}/${repo}.git`;
  try {
    let r = await run("git", ["clone", "--depth", "1", "--branch", branch, remote, source], work);
    commands.push({ ...r, command: `git clone --depth 1 --branch ${branch} https://x-access-token:***@github.com/${owner}/${repo}.git source` });
    if (r.code !== 0) throw new Error("Git clone failed. Check repo name, branch and token permissions.");

    const files = await walk(source);
    const packageText = await readOptional(path.join(source, "package.json"));
    const pkg = packageText ? JSON.parse(packageText) : undefined;
    const framework = detectFramework(files, pkg);

    if (!["static", "react-vite", "vue", "astro", "nextjs"].includes(framework)) {
      throw new Error(`GitHub Pages can only host static apps. Detected ${framework}.`);
    }

    const cmds = getCommands(framework, pkg);

    if (autoFix && framework === "nextjs") {
      const cfgPath = path.join(source, "next.config.mjs");
      await writeFile(cfgPath, `const nextConfig = { output: 'export', images: { unoptimized: true }, trailingSlash: true };\nexport default nextConfig;\n`);
      commands.push({ command: "nezora-auto-fix next-static-export", code: 0, stdout: "Wrote next.config.mjs with output: 'export'.", stderr: "" });
    }

    if (cmds.install !== "n/a") {
      const [cmd, ...args] = cmds.install.split(" ");
      r = await run(cmd, args, source); commands.push(r);
      if (r.code !== 0) { r = await run("npm", ["install"], source); commands.push({ ...r, command: "npm install # fallback" }); }
      if (r.code !== 0) throw new Error("Install failed.");
    }
    if (cmds.build !== "n/a") {
      const [cmd, ...args] = cmds.build.split(" ");
      r = await run(cmd, args, source); commands.push(r);
      if (r.code !== 0) throw new Error("Build failed.");
    }

    const publish = path.join(work, "publish");
    await mkdir(publish, { recursive: true });
    await run("git", ["init"], publish);
    await writeFile(path.join(publish, ".nojekyll"), "");
    await cp(path.join(source, cmds.output), publish, { recursive: true });
    for (const step of [
      ["config", "user.email", "deploy@nezora.local"], ["config", "user.name", "Nezora Deploy"],
      ["checkout", "-b", "gh-pages"], ["add", "."], ["commit", "-m", "Deploy via Nezora"],
      ["remote", "add", "origin", remote], ["push", "--force", "origin", "gh-pages"],
    ] as const) {
      r = await run("git", step as string[], publish);
      commands.push({ ...r, command: r.command.replace(remote, `https://x-access-token:***@github.com/${owner}/${repo}.git`) });
      if (r.code !== 0) throw new Error(`Git failed at: ${step.join(" ")}`);
    }
    res.json({ ok: true, url: `https://${owner}.github.io/${repo}/`, commands, recommendation: { framework, installCommand: cmds.install, buildCommand: cmds.build, startCommand: "n/a", outputDirectory: cmds.output }, message: "Deployed to GitHub Pages." });
  } catch (e) {
    res.status(400).json({ ok: false, commands, message: e instanceof Error ? e.message : "Deploy failed." });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

router.post("/real/zip", async (req: any, res) => {
  if (!assertAdmin(req, res)) return;
  const work = await mkdtemp(path.join(tmpdir(), "nezora-zip-"));
  try {
    const form = req.body;
    const file = req.files?.file;
    if (!file) {
      res.status(400).json({ ok: false, message: "Missing ZIP file." });
      return;
    }
    const fileBuffer: Buffer = file.data;
    if (fileBuffer.length > 75 * 1024 * 1024) {
      res.status(413).json({ ok: false, message: "ZIP too large. Keep under 75MB." });
      return;
    }
    const token = String(form.token || "");
    const owner = String(form.owner || "");
    const repo = String(form.repo || "");
    const projectName = String(form.projectName || repo || file.name?.replace(/\.zip$/i, "") || "project");
    const branch = String(form.branch || "main");
    const target = String(form.target || "pages");

    const extractDir = path.join(work, "extract");
    await mkdir(extractDir, { recursive: true });
    safeExtract(fileBuffer, extractDir);
    const sourceDir = await normalizeExtractedRoot(extractDir);

    if (target === "instant") {
      const slug = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
      const siteDest = path.join(LOCAL_SITE_ROOT, slug);
      await mkdir(LOCAL_SITE_ROOT, { recursive: true });
      await rm(siteDest, { recursive: true, force: true });
      const files = await walk(sourceDir);
      const packageText = await readOptional(path.join(sourceDir, "package.json"));
      const pkg = packageText ? JSON.parse(packageText) : undefined;
      const framework = detectFramework(files, pkg);
      const cmds = getCommands(framework, pkg);
      const commands: CommandResult[] = [];
      if (cmds.install !== "n/a") {
        const [cmd, ...args] = cmds.install.split(" ");
        let r = await run(cmd, args, sourceDir); commands.push(r);
        if (r.code !== 0) { r = await run("npm", ["install"], sourceDir); commands.push(r); }
        if (r.code !== 0) throw new Error("Install failed.");
      }
      if (cmds.build !== "n/a") {
        const [cmd, ...args] = cmds.build.split(" ");
        const r = await run(cmd, args, sourceDir); commands.push(r);
        if (r.code !== 0) throw new Error("Build failed.");
      }
      await cp(path.join(sourceDir, cmds.output), siteDest, { recursive: true });
      const origin = `${req.protocol}://${req.get("host")}`;
      res.json({ ok: true, slug, url: `${origin}/s/${slug}/`, recommendation: { framework, installCommand: cmds.install, buildCommand: cmds.build, startCommand: "n/a", outputDirectory: cmds.output }, commands, message: "Temporary no-API static URL is live." });
      return;
    }

    if (!token || !owner || !repo) {
      res.status(400).json({ ok: false, message: "GitHub owner, repo and token are required for GitHub Pages or Render Blueprint." });
      return;
    }

    const remote = `https://x-access-token:${encodeURIComponent(token)}@github.com/${owner}/${repo}.git`;
    const commands: CommandResult[] = [];

    if (target === "render") {
      const files = await walk(sourceDir);
      const packageText = await readOptional(path.join(sourceDir, "package.json"));
      const pkg = packageText ? JSON.parse(packageText) : undefined;
      const framework = detectFramework(files, pkg);
      const cmds = getCommands(framework, pkg);
      const renderYaml = `services:\n  - type: web\n    name: ${repo}\n    runtime: node\n    buildCommand: ${cmds.build}\n    startCommand: node dist/index.js\n`;
      await writeFile(path.join(sourceDir, "render.yaml"), renderYaml);
      for (const step of [
        ["init"], ["config", "user.email", "deploy@nezora.local"], ["config", "user.name", "Nezora Deploy"],
        ["checkout", "-b", branch], ["add", "."], ["commit", "-m", "Prepare Render deployment with Nezora Deploy"],
        ["remote", "add", "origin", remote], ["push", "--force", "origin", branch],
      ] as const) {
        const r = await run("git", step as string[], sourceDir);
        commands.push({ ...r, command: r.command.replace(remote, `https://x-access-token:***@github.com/${owner}/${repo}.git`) });
        if (r.code !== 0) throw new Error(`Git failed at: ${step.join(" ")}`);
      }
      res.json({ ok: true, recommendation: { framework, installCommand: cmds.install, buildCommand: cmds.build, startCommand: "npm start", outputDirectory: cmds.output }, repoUrl: `https://github.com/${owner}/${repo}`, renderDeployUrl: `https://render.com/deploy?repo=https://github.com/${owner}/${repo}`, commands, message: "ZIP prepared as a GitHub repo with render.yaml for Render." });
      return;
    }

    // pages target - deploy to GitHub Pages
    const files = await walk(sourceDir);
    const packageText = await readOptional(path.join(sourceDir, "package.json"));
    const pkg = packageText ? JSON.parse(packageText) : undefined;
    const framework = detectFramework(files, pkg);
    const cmds = getCommands(framework, pkg);
    if (cmds.install !== "n/a") {
      const [cmd, ...args] = cmds.install.split(" ");
      let r = await run(cmd, args, sourceDir); commands.push(r);
      if (r.code !== 0) { r = await run("npm", ["install"], sourceDir); commands.push(r); }
      if (r.code !== 0) throw new Error("Install failed.");
    }
    if (cmds.build !== "n/a") {
      const [cmd, ...args] = cmds.build.split(" ");
      const r = await run(cmd, args, sourceDir); commands.push(r);
      if (r.code !== 0) throw new Error("Build failed.");
    }
    const publish = path.join(work, "publish");
    await mkdir(publish, { recursive: true });
    await writeFile(path.join(publish, ".nojekyll"), "");
    await cp(path.join(sourceDir, cmds.output), publish, { recursive: true });
    for (const step of [
      ["init"], ["config", "user.email", "deploy@nezora.local"], ["config", "user.name", "Nezora Deploy"],
      ["checkout", "-b", "gh-pages"], ["add", "."], ["commit", "-m", "Deploy via Nezora"],
      ["remote", "add", "origin", remote], ["push", "--force", "origin", "gh-pages"],
    ] as const) {
      const r = await run("git", step as string[], publish);
      commands.push({ ...r, command: r.command.replace(remote, `https://x-access-token:***@github.com/${owner}/${repo}.git`) });
      if (r.code !== 0) throw new Error(`Git failed at: ${step.join(" ")}`);
    }
    res.json({ ok: true, url: `https://${owner}.github.io/${repo}/`, commands, recommendation: { framework, installCommand: cmds.install, buildCommand: cmds.build, startCommand: "n/a", outputDirectory: cmds.output }, message: "Deployed ZIP to GitHub Pages." });
  } catch (e) {
    res.status(400).json({ ok: false, message: e instanceof Error ? e.message : "ZIP deploy failed." });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

router.post("/deploy", (_req, res) => {
  res.status(501).json({ ok: false, message: "This endpoint is intentionally disabled. Use /api/real/github-pages or /api/real/zip." });
});

export default router;
