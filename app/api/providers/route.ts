import { NextResponse } from 'next/server';
import type { ProviderConnection } from '@/lib/types';

export async function GET() {
  const connections: ProviderConnection[] = [
    { key: 'cloudflare-pages', label: 'Cloudflare Pages', connected: true, status: 'healthy', limitText: 'Free Pages + SSL healthy' },
    { key: 'vercel', label: 'Vercel Hobby', connected: true, status: 'healthy', limitText: 'Personal projects ready' },
    { key: 'koyeb', label: 'Koyeb Nano', connected: false, status: 'disconnected', limitText: 'API key required' },
    { key: 'zeabur', label: 'Zeabur', connected: false, status: 'disconnected', limitText: 'API key required' },
    { key: 'northflank', label: 'Northflank Sandbox', connected: false, status: 'disconnected', limitText: 'API key required' },
    { key: 'bot-host', label: 'Free Bot Host', connected: false, status: 'warning', limitText: 'Manual host policy review' }
  ];
  return NextResponse.json({ connections });
}
