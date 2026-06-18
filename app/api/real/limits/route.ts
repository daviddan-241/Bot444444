import { NextRequest, NextResponse } from 'next/server';
import { assertAdminFromRequest } from '@/lib/server-auth';
import { ethicalLimitPolicy, ProviderLimit, stateFromRemaining } from '@/lib/limits';

export async function GET(req: NextRequest) {
  try { assertAdminFromRequest(req); } catch { return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 }); }
  const renderLimit: ProviderLimit = {
    provider: 'Render',
    metric: 'Service runtime',
    state: process.env.RENDER ? 'unknown' : 'unknown',
    note: process.env.RENDER ? 'Running on Render. Render does not expose every free-tier quota as environment variables; connect API key later for account-level readings.' : 'Not currently running on Render.',
    action: 'Use Render dashboard usage page and uptime monitors. Nezora can warn/fail over when official APIs provide quota signals.'
  };
  return NextResponse.json({ ok: true, limits: [renderLimit], policy: ethicalLimitPolicy(), render: { serviceId: process.env.RENDER_SERVICE_ID || null, externalUrl: process.env.RENDER_EXTERNAL_URL || null, instanceId: process.env.RENDER_INSTANCE_ID || null } });
}

export async function POST(req: NextRequest) {
  try { assertAdminFromRequest(req); } catch { return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 }); }
  const { githubToken } = await req.json();
  const limits: ProviderLimit[] = [];
  if (githubToken) {
    const gh = await fetch('https://api.github.com/rate_limit', { headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Nezora-Deploy' } });
    if (gh.ok) {
      const json = await gh.json();
      const core = json.resources?.core;
      limits.push({ provider: 'GitHub', metric: 'REST API core rate limit', used: core.used, limit: core.limit, remaining: core.remaining, resetAt: new Date(core.reset * 1000).toISOString(), state: stateFromRemaining(core.remaining, core.limit), note: 'Real GitHub API rate-limit reading from your token.', action: core.remaining <= core.limit * 0.2 ? 'Slow down deploys or wait until reset.' : 'Healthy.' });
    } else {
      limits.push({ provider: 'GitHub', metric: 'REST API core rate limit', state: 'unknown', note: `GitHub returned ${gh.status}`, action: 'Check token permissions.' });
    }
  }
  return NextResponse.json({ ok: true, limits, policy: ethicalLimitPolicy() });
}
