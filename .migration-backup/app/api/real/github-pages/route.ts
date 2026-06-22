import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAdminFromRequest } from '@/lib/server-auth';
import { deployStaticToGitHubPages } from '@/lib/real-deploy';

const schema = z.object({
  token: z.string().min(20),
  owner: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().default('main'),
  installCommand: z.string().optional(),
  buildCommand: z.string().optional(),
  outputDirectory: z.string().optional(),
  autoFix: z.boolean().default(true)
});

export async function POST(req: NextRequest) {
  try { assertAdminFromRequest(req); } catch { return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 }); }
  const body = schema.parse(await req.json());
  const result = await deployStaticToGitHubPages(body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
