import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    ok: false,
    message: 'This endpoint is intentionally disabled. Use /api/real/github-pages for GitHub Pages, /api/real/zip for ZIP uploads, or connect a provider token before enabling direct provider deployment.'
  }, { status: 501 });
}
