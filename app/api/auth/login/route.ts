import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/server-auth';
import { AUTH_COOKIE } from '@/lib/auth-constants';

export async function POST(req: NextRequest) {
  const { token } = await req.json();
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return NextResponse.json({ ok: false, message: 'ADMIN_TOKEN is not configured.' }, { status: 500 });
  if (typeof token !== 'string' || !safeEqual(token, expected)) return NextResponse.json({ ok: false, message: 'Invalid token.' }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return res;
}
