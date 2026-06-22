import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import path from 'path';
import { mkdtemp, rm, writeFile, readdir, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { assertAdminFromRequest } from '@/lib/server-auth';
import { deployStaticDirectoryToGitHubPages, pushDirectoryToGitHubForRender } from '@/lib/real-deploy';
import { buildAndHostStaticDirectory } from '@/lib/local-host';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function normalizeExtractedRoot(dir: string) {
  const entries = await readdir(dir);
  if (entries.length === 1) {
    const only = path.join(dir, entries[0]);
    if ((await stat(only)).isDirectory()) return only;
  }
  return dir;
}

function safeExtract(zipFile: string, dest: string) {
  const zip = new AdmZip(zipFile);
  const target = path.resolve(dest);
  for (const entry of zip.getEntries()) {
    const out = path.resolve(dest, entry.entryName);
    if (!out.startsWith(target + path.sep) && out !== target) throw new Error(`Unsafe ZIP path blocked: ${entry.entryName}`);
    if (entry.header.size > 200 * 1024 * 1024) throw new Error(`ZIP entry too large: ${entry.entryName}`);
  }
  zip.extractAllTo(dest, true);
}

export async function POST(req: NextRequest) {
  try { assertAdminFromRequest(req); } catch { return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 }); }
  const work = await mkdtemp(path.join(tmpdir(), 'nezora-zip-'));
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ ok: false, message: 'Missing ZIP file.' }, { status: 400 });
    if (file.size > 75 * 1024 * 1024) return NextResponse.json({ ok: false, message: 'ZIP too large for this starter. Keep under 75MB.' }, { status: 413 });
    const token = String(form.get('token') || '');
    const owner = String(form.get('owner') || '');
    const repo = String(form.get('repo') || '');
    const projectName = String(form.get('projectName') || repo || file.name.replace(/\.zip$/i, ''));
    const branch = String(form.get('branch') || 'main');
    const target = String(form.get('target') || 'pages');
    const kind = String(form.get('kind') || 'web') as 'web' | 'static' | 'bot' | 'worker' | 'api';
    if (target !== 'instant' && (!token || !owner || !repo)) return NextResponse.json({ ok: false, message: 'GitHub owner, repo and token are required for GitHub Pages or Render Blueprint. Use Instant Temporary URL for no-token hosting.' }, { status: 400 });
    const zipPath = path.join(work, 'upload.zip');
    await writeFile(zipPath, Buffer.from(await file.arrayBuffer()));
    const extractDir = path.join(work, 'extract');
    safeExtract(zipPath, extractDir);
    const sourceDir = await normalizeExtractedRoot(extractDir);
    if (target === 'instant') {
      const origin = req.headers.get('origin') || new URL(req.url).origin;
      const result = await buildAndHostStaticDirectory(sourceDir, projectName, origin);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    if (target === 'pages') {
      const result = await deployStaticDirectoryToGitHubPages({ token, owner, repo, branch, sourceDir, createRepo: true, autoFix: true });
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    const result = await pushDirectoryToGitHubForRender({ token, owner, repo, sourceDir, branch, projectKind: kind });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : 'ZIP deploy failed.' }, { status: 400 });
  } finally { await rm(work, { recursive: true, force: true }); }
}
