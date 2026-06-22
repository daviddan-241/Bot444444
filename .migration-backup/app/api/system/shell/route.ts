import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { assertAdminFromRequest } from '@/lib/server-auth';

const presets: Record<string, { cmd: string; args: string[]; label: string }> = {
  info: { cmd: 'sh', args: ['-lc', 'uname -a; printf "\\n--- release ---\\n"; cat /etc/os-release 2>/dev/null || true; printf "\\n--- node ---\\n"; node -v; npm -v; printf "\\n--- disk ---\\n"; df -h .; printf "\\n--- memory ---\\n"; free -m 2>/dev/null || true'], label: 'System info' },
  files: { cmd: 'sh', args: ['-lc', 'pwd; find . -maxdepth 2 -type f | sed "s#^./##" | sort | head -200'], label: 'List files' },
  doctor: { cmd: 'node', args: ['scripts/nezora-doctor.mjs'], label: 'Run Nezora doctor' },
  build: { cmd: 'npm', args: ['run', 'build'], label: 'Production build' },
  typecheck: { cmd: 'npm', args: ['run', 'typecheck'], label: 'TypeScript check' },
  audit: { cmd: 'npm', args: ['audit', '--omit=dev'], label: 'Dependency audit' },
  repair: { cmd: 'sh', args: ['-lc', 'npm install && npm run typecheck && npm run build'], label: 'Repair dependencies + verify build' },
  envsafe: { cmd: 'sh', args: ['-lc', 'env | cut -d= -f1 | sort | sed "s/$/=***/"'], label: 'Environment keys only' },
  processes: { cmd: 'sh', args: ['-lc', 'ps aux | head -80'], label: 'Process list' },
  network: { cmd: 'sh', args: ['-lc', 'hostname; getent hosts github.com render.com 2>/dev/null || true; curl -I --max-time 10 https://github.com 2>/dev/null | head || true'], label: 'Network check' },
  ports: { cmd: 'sh', args: ['-lc', 'ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null || true'], label: 'Open ports' },
  git: { cmd: 'sh', args: ['-lc', 'git status --short 2>/dev/null || true; git remote -v 2>/dev/null | sed "s#https://.*@#https://***@#" || true; git branch --show-current 2>/dev/null || true'], label: 'Git status' },
  render: { cmd: 'sh', args: ['-lc', 'printf "PORT=$PORT\nNODE_ENV=$NODE_ENV\nRENDER=$RENDER\nRENDER_SERVICE_ID=$RENDER_SERVICE_ID\nRENDER_EXTERNAL_URL=$RENDER_EXTERNAL_URL\n"'], label: 'Render runtime info' },
  clean: { cmd: 'sh', args: ['-lc', 'rm -rf .next && npm run build'], label: 'Clean Next build' }
};

function run(cmd: string, args: string[], timeout = 120000) {
  return new Promise<{ code: number; stdout: string; stderr: string; command: string }>((resolve) => {
    execFile(cmd, args, { cwd: process.cwd(), timeout, maxBuffer: 1024 * 1024 * 4 }, (error, stdout, stderr) => {
      resolve({ code: typeof (error as any)?.code === 'number' ? (error as any).code : 0, stdout, stderr, command: [cmd, ...args].join(' ') });
    });
  });
}

export async function GET(req: NextRequest) {
  try { assertAdminFromRequest(req); } catch { return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 }); }
  const results: Record<string, unknown> = {};
  for (const key of ['info']) results[key] = await run(presets[key].cmd, presets[key].args);
  return NextResponse.json({ ok: true, shell: process.env.SHELL || '/bin/sh', distro: results.info, presets: Object.fromEntries(Object.entries(presets).map(([k, v]) => [k, v.label])), customShellEnabled: process.env.ALLOW_SHELL === 'true' });
}

export async function POST(req: NextRequest) {
  try { assertAdminFromRequest(req); } catch { return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 }); }
  const body = await req.json();
  const preset = typeof body.preset === 'string' ? presets[body.preset] : undefined;
  if (preset) return NextResponse.json({ ok: true, result: await run(preset.cmd, preset.args) });
  if (process.env.ALLOW_SHELL !== 'true') return NextResponse.json({ ok: false, message: 'Custom shell disabled. Set ALLOW_SHELL=true only for your private Render service.' }, { status: 403 });
  const command = String(body.command || '').trim();
  if (!command) return NextResponse.json({ ok: false, message: 'Missing command.' }, { status: 400 });
  return NextResponse.json({ ok: true, result: await run('sh', ['-lc', command], 180000) });
}
