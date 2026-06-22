import { useState, useRef, useEffect } from 'react';
import { Shell } from '@/components/Shell';
import { Bot, Send, Loader2, User, Trash2, Sparkles, AlertCircle } from 'lucide-react';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');

interface Msg { role: 'user' | 'assistant'; content: string; ts: number; }

const SUGGESTIONS = [
  'Generate a Dockerfile for a Node.js Express API',
  'How do I deploy a Python FastAPI app?',
  'Why is my app crashing? How do I debug it?',
  'Write a docker-compose.yml for a full-stack app',
  'How do I set environment variables for my app?',
  'Optimize my React build for production',
];

export default function AI() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const base = BASE();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setError('');
    const userMsg: Msg = { role: 'user', content: msg, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const r = await fetch(`${base}/api/ai/chat`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })) }),
      });
      const d = await r.json();
      const aiMsg: Msg = { role: 'assistant', content: d.reply ?? d.message ?? 'No response', ts: Date.now() };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      setError('Failed to reach AI — check the API server is running');
    }
    setLoading(false);
    inputRef.current?.focus();
  };

  return (
    <Shell title="AI Assistant">
      <div className="animate-rise" style={{ maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 120px)', minHeight: 500 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div className="section-title">AI Assistant</div>
            <div className="section-subtitle">Powered by Groq Llama 3.3 · Dockerfile generation · Log analysis · Deploy advice</div>
          </div>
          {messages.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => setMessages([])}><Trash2 size={13} /> Clear</button>
          )}
        </div>

        {/* Chat area */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0 16px' }}>
          {messages.length === 0 && (
            <div>
              <div style={{ textAlign: 'center', padding: '20px 0 24px' }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <Sparkles size={24} color="#5856D6" />
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Ask me anything about your deployments</div>
                <div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>I can generate Dockerfiles, analyze errors, and help you deploy</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)} className="card card-inner" style={{ textAlign: 'left', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, padding: '12px 14px', transition: 'all .15s', border: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#007AFF')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: m.role === 'user' ? '#007AFF' : '#EDE9FE' }}>
                {m.role === 'user' ? <User size={15} color="#fff" /> : <Bot size={15} color="#5856D6" />}
              </div>
              <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: m.role === 'user' ? '#007AFF' : '#fff', color: m.role === 'user' ? '#fff' : 'var(--text-primary)', fontSize: 14, lineHeight: 1.6, border: m.role === 'assistant' ? '1px solid var(--border)' : 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={15} color="#5856D6" />
              </div>
              <div style={{ padding: '12px 16px', background: '#fff', borderRadius: '14px 14px 14px 4px', border: '1px solid var(--border)' }}>
                <Loader2 size={16} color="#5856D6" className="spin" />
              </div>
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#FEE2E2', borderRadius: 10, fontSize: 13, color: '#991B1B' }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input area */}
        <div className="card card-inner" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea ref={inputRef} className="field" style={{ flex: 1, minHeight: 44, maxHeight: 120, resize: 'vertical', padding: '10px 14px' }} placeholder="Ask about deployments, Dockerfiles, errors…" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="btn btn-primary btn-icon" onClick={() => send()} disabled={!input.trim() || loading} style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12 }}>
              {loading ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>Enter to send · Shift+Enter for new line · Llama 3.3 70B via Groq</div>
        </div>
      </div>
    </Shell>
  );
}
