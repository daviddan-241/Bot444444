import { PhoneHeader } from '@/components/PhoneHeader';
import { Shell } from '@/components/Shell';
import { StatusPill } from '@/components/StatusPill';
import { ShieldCheck } from 'lucide-react';

export default function AdminPage() {
  return (
    <Shell>
      <PhoneHeader title="Admin" subtitle="Private control" />
      <section className="px-5 pb-6">
        <div className="rounded-[32px] bg-white p-6 shadow-soft ring-1" style={{ boxShadow: '0 18px 50px rgba(7,17,31,0.08)', outline: '1px solid #E7ECF3' }}>
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: '#ECFDF5', color: '#059669' }}><ShieldCheck /></div>
            <div>
              <h2 className="text-xl font-black">Personal-only mode</h2>
              <p className="text-sm" style={{ color: '#65758B' }}>Protected by ADMIN_TOKEN middleware.</p>
            </div>
          </div>
          <div className="mt-5 rounded-3xl p-4" style={{ background: '#F6F8FB' }}>
            <StatusPill tone="success">Real security gate</StatusPill>
            <p className="mt-3 text-sm leading-6" style={{ color: '#65758B' }}>Add Supabase and provider webhooks to collect real users, deployments, errors and abuse events.</p>
          </div>
        </div>
      </section>
    </Shell>
  );
}
