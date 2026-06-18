import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import { AUTH_COOKIE } from './auth-constants';

export function adminTokenConfigured() {
  return Boolean(process.env.ADMIN_TOKEN && process.env.ADMIN_TOKEN.length >= 16);
}

export function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

export function assertAdminFromCookie() {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured) {
    if (process.env.NODE_ENV === 'production') throw new Error('ADMIN_TOKEN is required in production.');
    return true;
  }
  const token = cookies().get(AUTH_COOKIE)?.value;
  if (!token || !safeEqual(token, configured)) throw new Error('Unauthorized');
  return true;
}

export function assertAdminFromRequest(req: Request) {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured) {
    if (process.env.NODE_ENV === 'production') throw new Error('ADMIN_TOKEN is required in production.');
    return true;
  }
  const header = req.headers.get('x-nezora-admin-token') || '';
  const cookieHeader = req.headers.get('cookie') || '';
  const cookieToken = cookieHeader.match(new RegExp(`${AUTH_COOKIE}=([^;]+)`))?.[1];
  const token = header || cookieToken || '';
  if (!token || !safeEqual(decodeURIComponent(token), configured)) throw new Error('Unauthorized');
  return true;
}
