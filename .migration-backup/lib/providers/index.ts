import { ProviderAdapter, adapterNotConnected } from './base';
import { ProviderKey } from '../types';

const makeDisconnectedAdapter = (key: ProviderKey, label: string): ProviderAdapter => ({
  key,
  label,
  async testConnection() {
    return { ok: false, message: `${label} is not connected yet. Open Settings for token links and setup steps.` };
  },
  async *deploy() {
    adapterNotConnected(label);
  },
  async rollback() {
    return { ok: false, message: `${label} rollback requires a connected provider token.` };
  }
});

export const providers: Record<ProviderKey, ProviderAdapter> = {
  'cloudflare-pages': makeDisconnectedAdapter('cloudflare-pages', 'Cloudflare Pages'),
  vercel: makeDisconnectedAdapter('vercel', 'Vercel'),
  koyeb: makeDisconnectedAdapter('koyeb', 'Koyeb'),
  zeabur: makeDisconnectedAdapter('zeabur', 'Zeabur'),
  northflank: makeDisconnectedAdapter('northflank', 'Northflank'),
  'bot-host': makeDisconnectedAdapter('bot-host', 'Bot/container host'),
  manual: makeDisconnectedAdapter('manual', 'Manual deployment')
};
