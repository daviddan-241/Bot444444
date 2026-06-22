import { useState, useRef, useEffect, useCallback } from 'react';
import { Shell } from '@/components/Shell';
import { Bot, Send, Loader2, User, Trash2, Sparkles, AlertCircle, Zap } from 'lucide-react';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');

interface Msg { role: 'user' | 'assistant'; content: string; ts: number; streaming?: boolean; }

const SUGGESTIONS = [
  'Generate a Dockerfile for a Node.js Express API',
  'Write a docker-compose.yml for a full-stack app',
  'How do I deploy a Python FastAPI app?',
  'Why is my app crashing on startup?',
  'Optimize my React build for production',
  'Set up SSL with nginx + Let\'s Encrypt',
];

export default function AI() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [model, setModel] = useState<string>('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const base = BASE();

  // Auto-scroll on new content
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Detect active model on mount
  useEffect(() => {
    fetch(`${base}/api/ai/status`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.model) setModel(d.model); })
      .catch(() => {});
  }, [base]);

  const modelLabel = model.startsWith('ollama') ? `Ollama · ${model.split(':').slice(1).join(':') || 'llama3.2'} · Free` :
    model === 'llama-3.3-70b-versatile' ? 'Groq · Llama 3.3 · Free tier' :
    model === 'huggingface' ? 'HuggingFace · Free' :
    model === 'built-in' ? 'Built-in fallback' : 'Detecting model…';

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setError('');
    const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { role: 'user', content: msg, ts: Date.now() }]);
    setLoading(true);

    try {
      const r = await fetch(`${base}/api/ai/chat/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history }),
      });

      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);

      // Add empty assistant message for streaming
      setMessages(prev => [...prev, { role: 'assistant', content: '', ts: Date.now(), streaming: true }]);

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          try {
            const parsed = JSON.parse(raw);
            if (parsed.token) {
              fullContent += parsed.token;
              setMessages(prev => [...prev.slice(0, -1), { ...prev[prev.length - 1], content: fullContent }]);
            }
            if (parsed.done && parsed.model) {
              setModel(parsed.model);
              setMessages(prev => [...prev.slice(0, -1), { ...prev[prev.length - 1], streaming: false }]);
            }
          } catch {}
        }
      }
    } catch {
      setError('AI unavailable — make sure the API server is running and Ollama is reachable');
    }

    setLoading(false);
    inputRef.current?.focus();
  }, [input, loading, messages, base]);

  return (
    <Shell title="AI Assistant">
      <div className="animate-rise" style={{ maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 120px)', minHeight: 500 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div className="section-title">AI Assistant</div>
            <div className="section-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={12} color="#34C759" />
              {modelLabel} · Dockerfile generation · Log analysis · Deploy advice
            </div>
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
                <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #5856D6, #007AFF)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <Sparkles size={24} color="#fff" />
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Ask me anything about your deployments</div>
                <div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
                  Free AI — powered by Ollama (local) with Groq + HuggingFace fallbacks
                </div>
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
              <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: m.role === 'user' ? '#007AFF' : 'linear-gradient(135deg, #5856D6, #007AFF)' }}>
                {m.role === 'user' ? <User size={15} color="#fff" /> : <Bot size={15} color="#fff" />}
              </div>
              <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: m.role === 'user' ? '#007AFF' : 'var(--surface)', color: m.role === 'user' ? '#fff' : 'var(--text-primary)', fontSize: 14, lineHeight: 1.6, border: m.role === 'assistant' ? '1px solid var(--border)' : 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {m.content || (m.streaming ? <span style={{ display: 'inline-flex', gap: 3, paddingTop: 4 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: '#5856D6', animation: 'pulse 1s infinite' }} /><span style={{ width: 6, height: 6, borderRadius: 3, background: '#5856D6', animation: 'pulse 1s infinite .2s' }} /><span style={{ width: 6, height: 6, borderRadius: 3, background: '#5856D6', animation: 'pulse 1s infinite .4s' }} /></span> : '')}
              </div>
            </div>
          ))}

          {loading && !messages.some(m => m.streaming) && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #5856D6, #007AFF)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={15} color="#fff" />
              </div>
              <div style={{ padding: '12px 16px', background: 'var(--surface)', borderRadius: '14px 14px 14px 4px', border: '1px solid var(--border)' }}>
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

        {/* Input */}
        <div className="card card-inner" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea ref={inputRef} className="field" style={{ flex: 1, minHeight: 44, maxHeight: 120, resize: 'vertical', padding: '10px 14px' }} placeholder="Ask about Dockerfiles, deployments, errors…" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="btn btn-primary btn-icon" onClick={() => send()} disabled={!input.trim() || loading} style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12 }}>
              {loading ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
            Enter to send · Shift+Enter for new line · {modelLabel}
          </div>
        </div>

      </div>
    </Shell>
  );
}
