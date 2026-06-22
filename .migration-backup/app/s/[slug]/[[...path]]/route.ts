import { NextRequest } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { LOCAL_SITE_ROOT } from '@/lib/local-host';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

async function fileExists(file: string) { try { return (await stat(file)).isFile(); } catch { return false; } }

export async function GET(_req: NextRequest, ctx: { params: { slug: string; path?: string[] } }) {
  const slug = ctx.params.slug.replace(/[^a-z0-9-]/g, '');
  const rel = (ctx.params.path || []).join('/') || 'index.html';
  const root = path.resolve(LOCAL_SITE_ROOT, slug);
  let file = path.resolve(root, rel);
  if (!file.startsWith(root)) return new Response('Blocked', { status: 403 });
  if (!(await fileExists(file))) file = path.join(root, 'index.html');
  if (!(await fileExists(file))) return new Response('Site not found or expired. Redeploy from Nezora.', { status: 404 });
  const body = await readFile(file);
  return new Response(body, { headers: { 'content-type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'public, max-age=60' } });
}
