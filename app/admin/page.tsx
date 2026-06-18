import { PhoneHeader } from '@/components/PhoneHeader';
import { Shell } from '@/components/Shell';
import { StatusPill } from '@/components/StatusPill';
import { ShieldCheck } from 'lucide-react';

export default function AdminPage() {
  return <Shell><PhoneHeader title="Admin" subtitle="Private control" />
    <section className="px-5"><div className="rounded-[32px] bg-white p-6 shadow-soft ring-1 ring-line"><div className="flex items-center gap-3"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><ShieldCheck /></div><div><h2 className="text-xl font-black">Personal-only mode</h2><p className="text-sm text-muted">Protected by ADMIN_TOKEN middleware.</p></div></div><div className="mt-5 rounded-3xl bg-cloud p-4"><StatusPill tone="success">Real security gate</StatusPill><p className="mt-3 text-sm leading-6 text-muted">Add Supabase and provider webhooks to collect real users, deployments, errors and abuse events.</p></div></div></section>
  </Shell>;
}
