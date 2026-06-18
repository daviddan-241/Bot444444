import { execFile } from 'child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import { detectProject } from './detector';
import { slugify } from './router';
import type { BuildRecommendation } from './types';

export interface LocalCommandResult { command: string; code: number; stdout: string; stderr: string; }
export interface LocalHostResult { ok: boolean; slug?: string; url?: string; recommendation?: BuildRecommendation; commands: LocalCommandResult[]; message: string; }

export const LOCAL_SITE_ROOT = process.env.NEZORA_LOCAL_SITE_ROOT || '/tmp/nezora-sites';

function run(command: string, args: readonly string[], cwd: string, timeoutMs = 1000 * 60 * 10): Promise<LocalCommandResult> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 8, env: { ...process.env, CI: 'true' } }, (error, stdout, stderr) => {
      const rawCode = (error as any)?.code;
      const code = typeof rawCode === 'number' ? rawCode : error ? 127 : 0;
      const finalStderr = stderr || (error ? String((error as Error).message) : '');
      resolve({ command: [command, ...args].join(' '), code, stdout, stderr: finalStderr });
    });
  });
}

async function walk(dir: string, root = dir): Promise<string[]> {
  const entries = await readdir(dir);
  const out: string[] = [];
  for (const entry of entries) {
    if (['.git', 'node_modules', '.next', 'dist', 'build'].includes(entry)) continue;
    const full = path.join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) out.push(...await walk(full, root));
    else out.push(path.relative(root, full));
  }
  return out.slice(0, 6000);
}

async function readOptional(file: string) { try { return await readFile(file, 'utf8'); } catch { return undefined; } }

async function applyNextStaticExportFix(projectDir: string, rec: BuildRecommendation, commands: LocalCommandResult[]) {
  if (rec.framework !== 'nextjs') return;
  const configPath = path.join(projectDir, 'next.config.mjs');
  const content = `const nextConfig = { output: 'export', images: { unoptimized: true }, trailingSlash: true };\nexport default nextConfig;\n`;
  await writeFile(configPath, content);
  commands.push({ command: 'nezora nextjs static export fix', code: 0, stdout: `Wrote ${configPath}`, stderr: '' });
}

export async function buildAndHostStaticDirectory(sourceDir: string, projectName: string, origin: string): Promise<LocalHostResult> {
  const commands: LocalCommandResult[] = [];
  const slug = `${slugify(projectName)}-${Date.now().toString(36)}`;
  const target = path.join(LOCAL_SITE_ROOT, slug);
  try {
    const files = await walk(sourceDir);
    const packageText = await readOptional(path.join(sourceDir, 'package.json'));
    const packageJson = packageText ? JSON.parse(packageText) : undefined;
    const rec = detectProject({ files, packageJson, requirementsTxt: await readOptional(path.join(sourceDir, 'requirements.txt')), dockerfile: await readOptional(path.join(sourceDir, 'Dockerfile')) });
    if (!['static', 'react-vite', 'vue', 'astro', 'nextjs'].includes(rec.framework)) {
      throw new Error(`Temporary no-API hosting supports static/frontend projects only. Detected ${rec.framework}. Use Render Blueprint for apps, APIs, bots and workers.`);
    }
    await applyNextStaticExportFix(sourceDir, rec, commands);
    if (rec.installCommand !== 'n/a') {
      const [cmd, ...args] = rec.installCommand.split(' ');
      let r = await run(cmd, args, sourceDir); commands.push(r);
      if (r.code !== 0 && rec.installCommand === 'npm ci') { r = await run('npm', ['install'], sourceDir); commands.push({ ...r, command: 'npm install # fallback after npm ci failed' }); }
      if (r.code !== 0) throw new Error('Install failed. See command logs.');
    }
    if (rec.buildCommand !== 'n/a') {
      const [cmd, ...args] = rec.buildCommand.split(' ');
      const r = await run(cmd, args, sourceDir); commands.push(r);
      if (r.code !== 0) throw new Error('Build failed. See command logs.');
    }
    await mkdir(LOCAL_SITE_ROOT, { recursive: true });
    await rm(target, { recursive: true, force: true });
    await cp(path.join(sourceDir, rec.outputDirectory), target, { recursive: true });
    return { ok: true, slug, url: `${origin}/s/${slug}/`, recommendation: rec, commands, message: 'Temporary no-API static URL is live on this Nezora instance.' };
  } catch (e) {
    return { ok: false, commands, message: e instanceof Error ? e.message : 'Local hosting failed.' };
  }
}
