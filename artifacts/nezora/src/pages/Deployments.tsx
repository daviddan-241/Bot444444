import { PhoneHeader } from '@/components/PhoneHeader';
import { Shell } from '@/components/Shell';
import { StatusPill } from '@/components/StatusPill';
import { Rocket, UploadCloud } from 'lucide-react';
import { Link } from 'wouter';

export default function DeploymentsPage() {
  return (
    <Shell>
      <PhoneHeader title="Deployments" subtitle="Real history" />
      <section className="px-5">
        <div className="rounded-[32px] bg-white p-6 text-center shadow-soft ring-1" style={{ boxShadow: '0 18px 50px rgba(7,17,31,0.08)', outline: '1px solid #E7ECF3' }}>
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl" style={{ background: '#EEF6FF', color: '#006BE6' }}><UploadCloud /></div>
          <h2 className="mt-5 text-2xl font-black tracking-[-0.04em]">No saved deployment history yet</h2>
          <p className="mt-3 text-sm leading-6" style={{ color: '#65758B' }}>Real GitHub Pages and ZIP/Render preparation work now. Persistent history requires connecting Supabase using the included schema.</p>
          <Link href="/real" className="mt-5 flex h-14 items-center justify-center gap-2 rounded-3xl font-black text-white" style={{ background: '#0A84FF' }}><Rocket size={18} /> Create real deployment</Link>
        </div>
      </section>
      <section className="mt-5 px-5">
        <div className="rounded-[30px] p-5 text-white" style={{ background: '#07111F' }}>
          <StatusPill tone="info">Real records</StatusPill>
          <p className="mt-3 text-sm leading-6" style={{ color: 'rgba(255,255,255,0.70)' }}>Once Supabase is configured, deployments from completed runs can be recorded here.</p>
        </div>
      </section>
    </Shell>
  );
}
