import { execFile } from 'child_process';
import { mkdtemp, readFile, readdir, stat, cp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { detectProject } from './detector';
import type { BuildRecommendation } from './types';

export interface CommandResult { command: string; code: number; stdout: string; stderr: string; }
export interface GitHubPagesDeployInput {
  token: string;
  owner: string;
  repo: string;
  branch?: string;
  installCommand?: string;
  buildCommand?: string;
  outputDirectory?: string;
  autoFix?: boolean;
}
export interface GitHubPagesDeployResult {
  ok: boolean;
  url?: string;
  recommendation?: BuildRecommendation;
  commands: CommandResult[];
  message: string;
}

function run(command: string, args: readonly string[], cwd: string, timeoutMs = 1000 * 60 * 10): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 8, env: { ...process.env, CI: 'true' } }, (error, stdout, stderr) => {
      resolve({ command: [command, ...args].join(' '), code: typeof (error as any)?.code === 'number' ? (error as any).code : 0, stdout, stderr });
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

async function readOptional(file: string) {
  try { return await readFile(file, 'utf8'); } catch { return undefined; }
}

async function applyStaticFixes(projectDir: string, rec: BuildRecommendation, commands: CommandResult[]) {
  if (rec.framework !== 'nextjs') return;
  const configPath = path.join(projectDir, 'next.config.mjs');
  const jsPath = path.join(projectDir, 'next.config.js');
  const content = `/** Added by Nezora Deploy auto-fix for GitHub Pages static hosting. */\nconst nextConfig = { output: 'export', images: { unoptimized: true }, trailingSlash: true };\nexport default nextConfig;\n`;
  await writeFile(configPath, content);
  commands.push({ command: 'nezora-auto-fix next-static-export', code: 0, stdout: `Wrote ${path.basename(configPath)} with output: 'export'.`, stderr: jsPath });
}

export async function deployStaticToGitHubPages(input: GitHubPagesDeployInput): Promise<GitHubPagesDeployResult> {
  const commands: CommandResult[] = [];
  const branch = input.branch || 'main';
  const work = await mkdtemp(path.join(tmpdir(), 'nezora-gh-pages-'));
  const source = path.join(work, 'source');
  const publish = path.join(work, 'publish');
  const remote = `https://x-access-token:${encodeURIComponent(input.token)}@github.com/${input.owner}/${input.repo}.git`;
  try {
    let r = await run('git', ['clone', '--depth', '1', '--branch', branch, remote, source], work);
    commands.push({ ...r, command: `git clone --depth 1 --branch ${branch} https://x-access-token:***@github.com/${input.owner}/${input.repo}.git source` });
    if (r.code !== 0) throw new Error('Git clone failed. Check repo name, branch and token permissions.');

    const files = await walk(source);
    const packageText = await readOptional(path.join(source, 'package.json'));
    const packageJson = packageText ? JSON.parse(packageText) : undefined;
    const rec = detectProject({ files, packageJson, requirementsTxt: await readOptional(path.join(source, 'requirements.txt')), dockerfile: await readOptional(path.join(source, 'Dockerfile')) });

    if (!['static', 'react-vite', 'vue', 'astro', 'nextjs'].includes(rec.framework)) {
      throw new Error(`GitHub Pages can only host static apps. Detected ${rec.framework}. Use Render/Koyeb for services and APIs.`);
    }

    const installCommand = input.installCommand || rec.installCommand;
    const buildCommand = input.buildCommand || rec.buildCommand;
    let outputDirectory = input.outputDirectory || rec.outputDirectory;

    if (input.autoFix) await applyStaticFixes(source, rec, commands);

    if (installCommand !== 'n/a') {
      const [cmd, ...args] = installCommand.split(' ');
      r = await run(cmd, args, source);
      commands.push(r);
      if (r.code !== 0 && installCommand === 'npm ci') {
        r = await run('npm', ['install'], source);
        commands.push({ ...r, command: 'npm install # fallback after npm ci failed' });
      }
      if (r.code !== 0) throw new Error('Install failed. See command logs.');
    }
    if (buildCommand !== 'n/a') {
      const [cmd, ...args] = buildCommand.split(' ');
      r = await run(cmd, args, source);
      commands.push(r);
      if (r.code !== 0) throw new Error('Build failed. Enable auto-fix or inspect logs.');
    }

    const artifact = path.join(source, outputDirectory);
    await rm(publish, { recursive: true, force: true });
    await cp(artifact, publish, { recursive: true });
    await writeFile(path.join(publish, '.nojekyll'), '');

    for (const step of [
      ['git', ['init']],
      ['git', ['config', 'user.email', 'deploy@nezora.local']],
      ['git', ['config', 'user.name', 'Nezora Deploy']],
      ['git', ['checkout', '-b', 'gh-pages']],
      ['git', ['add', '.']],
      ['git', ['commit', '-m', 'Deploy with Nezora Deploy']],
      ['git', ['remote', 'add', 'origin', remote]],
      ['git', ['push', '--force', 'origin', 'gh-pages']]
    ] as const) {
      r = await run(step[0], step[1], publish);
      commands.push({ ...r, command: r.command.replace(remote, `https://x-access-token:***@github.com/${input.owner}/${input.repo}.git`) });
      if (r.code !== 0) throw new Error(`Publish failed at: ${step[0]} ${step[1].join(' ')}`);
    }

    const pagesBody = JSON.stringify({ source: { branch: 'gh-pages', path: '/' } });
    let api = await fetch(`https://api.github.com/repos/${input.owner}/${input.repo}/pages`, { method: 'POST', headers: ghHeaders(input.token), body: pagesBody });
    if (api.status === 409 || api.status === 422) {
      api = await fetch(`https://api.github.com/repos/${input.owner}/${input.repo}/pages`, { method: 'PUT', headers: ghHeaders(input.token), body: pagesBody });
    }
    if (!api.ok) {
      const text = await api.text();
      commands.push({ command: 'GitHub Pages API enable/update', code: api.status, stdout: text, stderr: '' });
      throw new Error('Files were pushed, but enabling GitHub Pages failed. Enable Pages manually: Settings > Pages > gh-pages branch.');
    }

    return { ok: true, url: `https://${input.owner}.github.io/${input.repo}/`, recommendation: rec, commands, message: 'Static project deployed to real GitHub Pages.' };
  } catch (e) {
    return { ok: false, commands, message: e instanceof Error ? e.message : 'Unknown deployment error' };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'Nezora-Deploy'
  };
}

export interface GitHubZipRepoInput {
  token: string;
  owner: string;
  repo: string;
  sourceDir: string;
  branch?: string;
  projectKind?: 'web' | 'static' | 'bot' | 'worker' | 'api';
  makePrivate?: boolean;
}

export async function ensureGitHubRepo(token: string, owner: string, repo: string, makePrivate = false) {
  const existing = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: ghHeaders(token) });
  if (existing.ok) return { ok: true, created: false, url: `https://github.com/${owner}/${repo}` };
  const user = await fetch('https://api.github.com/user', { headers: ghHeaders(token) });
  const userJson = user.ok ? await user.json() : {};
  const endpoint = userJson.login?.toLowerCase() === owner.toLowerCase() ? 'https://api.github.com/user/repos' : `https://api.github.com/orgs/${owner}/repos`;
  const created = await fetch(endpoint, { method: 'POST', headers: ghHeaders(token), body: JSON.stringify({ name: repo, private: makePrivate, auto_init: false }) });
  if (!created.ok) throw new Error(`Could not create GitHub repo ${owner}/${repo}: ${await created.text()}`);
  return { ok: true, created: true, url: `https://github.com/${owner}/${repo}` };
}

export async function deployStaticDirectoryToGitHubPages(input: GitHubPagesDeployInput & { sourceDir: string; createRepo?: boolean; makePrivate?: boolean }): Promise<GitHubPagesDeployResult> {
  const commands: CommandResult[] = [];
  const branch = input.branch || 'main';
  const work = await mkdtemp(path.join(tmpdir(), 'nezora-dir-pages-'));
  const source = path.join(work, 'source');
  const publish = path.join(work, 'publish');
  const remote = `https://x-access-token:${encodeURIComponent(input.token)}@github.com/${input.owner}/${input.repo}.git`;
  try {
    if (input.createRepo) await ensureGitHubRepo(input.token, input.owner, input.repo, input.makePrivate);
    await cp(input.sourceDir, source, { recursive: true });
    await rm(path.join(source, '.git'), { recursive: true, force: true });
    const files = await walk(source);
    const packageText = await readOptional(path.join(source, 'package.json'));
    const packageJson = packageText ? JSON.parse(packageText) : undefined;
    const rec = detectProject({ files, packageJson, requirementsTxt: await readOptional(path.join(source, 'requirements.txt')), dockerfile: await readOptional(path.join(source, 'Dockerfile')) });
    if (!['static', 'react-vite', 'vue', 'astro', 'nextjs'].includes(rec.framework)) throw new Error(`GitHub Pages can only host static apps. Detected ${rec.framework}. For APIs/bots, prepare a Render Blueprint instead.`);
    if (input.autoFix) await applyStaticFixes(source, rec, commands);
    const installCommand = input.installCommand || rec.installCommand;
    const buildCommand = input.buildCommand || rec.buildCommand;
    const outputDirectory = input.outputDirectory || rec.outputDirectory;
    let r: CommandResult;
    if (installCommand !== 'n/a') {
      const [cmd, ...args] = installCommand.split(' ');
      r = await run(cmd, args, source); commands.push(r);
      if (r.code !== 0 && installCommand === 'npm ci') { r = await run('npm', ['install'], source); commands.push({ ...r, command: 'npm install # fallback after npm ci failed' }); }
      if (r.code !== 0) throw new Error('Install failed. See command logs.');
    }
    if (buildCommand !== 'n/a') {
      const [cmd, ...args] = buildCommand.split(' ');
      r = await run(cmd, args, source); commands.push(r);
      if (r.code !== 0) throw new Error('Build failed. Inspect logs or fix project locally.');
    }
    await rm(publish, { recursive: true, force: true });
    await cp(path.join(source, outputDirectory), publish, { recursive: true });
    await writeFile(path.join(publish, '.nojekyll'), '');
    for (const step of [
      ['git', ['init']], ['git', ['config', 'user.email', 'deploy@nezora.local']], ['git', ['config', 'user.name', 'Nezora Deploy']],
      ['git', ['checkout', '-b', 'gh-pages']], ['git', ['add', '.']], ['git', ['commit', '-m', 'Deploy ZIP with Nezora Deploy']],
      ['git', ['remote', 'add', 'origin', remote]], ['git', ['push', '--force', 'origin', 'gh-pages']]
    ] as const) {
      r = await run(step[0], step[1], publish); commands.push({ ...r, command: r.command.replace(remote, `https://x-access-token:***@github.com/${input.owner}/${input.repo}.git`) });
      if (r.code !== 0) throw new Error(`Publish failed at: ${step[0]} ${step[1].join(' ')}`);
    }
    const pagesBody = JSON.stringify({ source: { branch: 'gh-pages', path: '/' } });
    let api = await fetch(`https://api.github.com/repos/${input.owner}/${input.repo}/pages`, { method: 'POST', headers: ghHeaders(input.token), body: pagesBody });
    if (api.status === 409 || api.status === 422) api = await fetch(`https://api.github.com/repos/${input.owner}/${input.repo}/pages`, { method: 'PUT', headers: ghHeaders(input.token), body: pagesBody });
    if (!api.ok) throw new Error(`Pages API failed: ${await api.text()}`);
    return { ok: true, url: `https://${input.owner}.github.io/${input.repo}/`, recommendation: rec, commands, message: 'ZIP deployed to real GitHub Pages.' };
  } catch (e) {
    return { ok: false, commands, message: e instanceof Error ? e.message : 'Unknown ZIP deployment error' };
  } finally { await rm(work, { recursive: true, force: true }); }
}

export function renderYamlFor(rec: BuildRecommendation, name: string, kind: GitHubZipRepoInput['projectKind'] = 'web') {
  const safe = slugName(name);
  const isDocker = rec.framework === 'docker';
  const isStatic = kind === 'static' || rec.runtime === 'static';
  if (isStatic) {
    return `services:\n  - type: static_site\n    name: ${safe}\n    buildCommand: ${JSON.stringify(rec.buildCommand === 'n/a' ? 'echo "No build required"' : rec.buildCommand)}\n    staticPublishPath: ${JSON.stringify(rec.outputDirectory)}\n    autoDeployTrigger: commit\n`;
  }
  return `services:\n  - type: web\n    name: ${safe}\n    runtime: ${isDocker ? 'docker' : rec.runtime.startsWith('python') ? 'python' : 'node'}\n    plan: free\n    buildCommand: ${JSON.stringify(rec.buildCommand === 'n/a' ? rec.installCommand : `${rec.installCommand} && ${rec.buildCommand}`)}\n    startCommand: ${JSON.stringify(rec.startCommand)}\n    healthCheckPath: /\n    autoDeployTrigger: commit\n    envVars:\n      - key: NODE_ENV\n        value: production\n`;
}

function slugName(name: string) { return name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'nezora-app'; }

export async function pushDirectoryToGitHubForRender(input: GitHubZipRepoInput) {
  const commands: CommandResult[] = [];
  const branch = input.branch || 'main';
  const work = await mkdtemp(path.join(tmpdir(), 'nezora-render-repo-'));
  const source = path.join(work, 'source');
  const remote = `https://x-access-token:${encodeURIComponent(input.token)}@github.com/${input.owner}/${input.repo}.git`;
  try {
    await ensureGitHubRepo(input.token, input.owner, input.repo, input.makePrivate);
    await cp(input.sourceDir, source, { recursive: true });
    await rm(path.join(source, '.git'), { recursive: true, force: true });
    const files = await walk(source);
    const packageText = await readOptional(path.join(source, 'package.json'));
    const packageJson = packageText ? JSON.parse(packageText) : undefined;
    const rec = detectProject({ files, packageJson, requirementsTxt: await readOptional(path.join(source, 'requirements.txt')), dockerfile: await readOptional(path.join(source, 'Dockerfile')) });
    await writeFile(path.join(source, 'render.yaml'), renderYamlFor(rec, input.repo, input.projectKind));
    await writeFile(path.join(source, 'NEZORA_RENDER_README.md'), `# Deploy on Render\n\nThis repo was prepared by Nezora Deploy.\n\nClick:\n\nhttps://render.com/deploy?repo=https://github.com/${input.owner}/${input.repo}\n\nDetected: ${rec.framework}\n\nInstall: ${rec.installCommand}\nBuild: ${rec.buildCommand}\nStart: ${rec.startCommand}\n`);
    let r: CommandResult;
    for (const step of [
      ['git', ['init']], ['git', ['config', 'user.email', 'deploy@nezora.local']], ['git', ['config', 'user.name', 'Nezora Deploy']],
      ['git', ['checkout', '-b', branch]], ['git', ['add', '.']], ['git', ['commit', '-m', 'Prepare Render deployment with Nezora Deploy']],
      ['git', ['remote', 'add', 'origin', remote]], ['git', ['push', '--force', 'origin', branch]]
    ] as const) {
      r = await run(step[0], step[1], source); commands.push({ ...r, command: r.command.replace(remote, `https://x-access-token:***@github.com/${input.owner}/${input.repo}.git`) });
      if (r.code !== 0) throw new Error(`GitHub publish failed at: ${step[0]} ${step[1].join(' ')}`);
    }
    return { ok: true, recommendation: rec, repoUrl: `https://github.com/${input.owner}/${input.repo}`, renderDeployUrl: `https://render.com/deploy?repo=https://github.com/${input.owner}/${input.repo}`, commands, message: 'ZIP prepared as a real GitHub repo with render.yaml for Render.' };
  } catch (e) { return { ok: false, commands, message: e instanceof Error ? e.message : 'Unknown Render prep error' }; }
  finally { await rm(work, { recursive: true, force: true }); }
}
