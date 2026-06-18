import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE } from './lib/auth-constants';

export function middleware(req: NextRequest) {
  const configured = process.env.ADMIN_TOKEN;
  const { pathname } = req.nextUrl;
  const publicPaths = ['/login', '/api/auth/login', '/_next', '/favicon.ico'];
  if (!configured || publicPaths.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie === configured) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
