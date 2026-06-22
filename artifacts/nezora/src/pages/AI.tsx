import { useState, useRef, useEffect } from 'react';
import { Shell } from '@/components/Shell';
import { Bot, Send, Loader2, User, Sparkles, Trash2, AlertCircle } from 'lucide-react';

interface Message { role: 'user' | 'assistant'; content: string; ts: number; }

const SUGGESTIONS = [
  'Analyze my latest deployment failure',
  'Generate a Dockerfile for a Node.js app',
  'How do I optimize my build time?',
  'What is the best way to deploy a Next.js app?',
  'Explain my build logs',
  'Help me configure environment variables',
];

export default function AI() {
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: "Hi! I'm your Cloud OS AI assistant. I can help you analyze deployments, generate Dockerfiles, review build logs, suggest fixes, and answer infrastructure questions. What do you need?",
    ts: Date.now(),
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send(text?: string) {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    setError('');
    const userMsg: Message = { role: 'user', content: msg, ts: Date.now() };
    setMessages(p => [...p, userMsg]);
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: messages.slice(-8) }),
        credentials: 'include',
      });
      const d = await r.json();
      if (d.reply) {
        setMessages(p => [...p, { role: 'assistant', content: d.reply, ts: Date.now() }]);
      } else {
        setError(d.error || 'No response from AI');
      }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  return (
    <Shell>
      <div className="flex flex-col h-[calc(100dvh-64px)] max-w-3xl mx-auto">
        {/* Header */}
        <div className="p-4 lg:px-7 border-b flex items-center justify-between" style={{ borderColor: '#E2E8F2' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[12px] flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>
              <Bot size={18} color="white" />
            </div>
            <div>
              <div className="text-[14px] font-700" style={{ color: '#0A0F1E' }}>AI Assistant</div>
              <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: '#30D158' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-dot inline-block" />
                Powered by free LLM
              </div>
            </div>
          </div>
          <button onClick={() => setMessages([])} className="p-2 rounded-xl hover:bg-slate-100 transition" title="Clear chat">
            <Trash2 size={14} color="#8E9BAD" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 lg:px-7 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-rise`}>
              {m.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>
                  <Bot size={14} color="white" />
                </div>
              )}
              <div className={`max-w-[80%] px-4 py-3 rounded-[18px] text-[13.5px] leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'text-white rounded-tr-[6px]'
                  : 'rounded-tl-[6px]'
              }`} style={m.role === 'user'
                ? { background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)', color: 'white' }
                : { background: 'white', border: '1px solid #E2E8F2', color: '#0A0F1E' }}>
                {m.content}
              </div>
              {m.role === 'user' && (
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: '#F0F3F8' }}>
                  <User size={14} color="#5E6E85" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 justify-start animate-rise">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>
                <Bot size={14} color="white" />
              </div>
              <div className="px-4 py-3 rounded-[18px] rounded-tl-[6px] flex items-center gap-2" style={{ background: 'white', border: '1px solid #E2E8F2' }}>
                <Loader2 size={14} color="#8E9BAD" className="animate-spin" />
                <span className="text-[13px]" style={{ color: '#8E9BAD' }}>Thinking…</span>
              </div>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-[14px]" style={{ background: '#FFF0EF', border: '1px solid #FFCDD0' }}>
              <AlertCircle size={14} color="#FF453A" />
              <span className="text-[12.5px]" style={{ color: '#C0392B' }}>{error}</span>
            </div>
          )}
          {messages.length === 1 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[12px]" style={{ color: '#8E9BAD' }}>
                <Sparkles size={13} /> Try asking…
              </div>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)} className="block w-full text-left px-4 py-2.5 rounded-[13px] text-[13px] hover:bg-blue-50 transition border" style={{ borderColor: '#E2E8F2', color: '#3D4D63', background: 'white' }}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 lg:px-7 border-t" style={{ borderColor: '#E2E8F2', background: 'white' }}>
          <form onSubmit={e => { e.preventDefault(); send(); }} className="flex gap-3">
            <input
              className="flex-1 field"
              placeholder="Ask about deployments, logs, Dockerfiles…"
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
            />
            <button type="submit" disabled={loading || !input.trim()}
              className="w-11 h-12 rounded-[14px] flex items-center justify-center flex-shrink-0 transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg,#0A84FF,#5E5CE6)' }}>
              {loading ? <Loader2 size={16} color="white" className="animate-spin" /> : <Send size={16} color="white" />}
            </button>
          </form>
        </div>
      </div>
    </Shell>
  );
}
