import { useState, useRef, useEffect, useCallback } from 'react';
import { Shell } from '@/components/Shell';
import {
  Bot, Send, Loader2, User, Trash2, Sparkles, AlertCircle, Zap,
  Paperclip, X, GitBranch, FolderOpen, ChevronDown, ChevronRight,
  Wrench, FlaskConical, Map
} from 'lucide-react';

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, '');
const STORAGE_KEY = 'nezora_ai_messages';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  streaming?: boolean;
}

const SUGGESTIONS = [
  'Generate a Dockerfile for a Node.js Express API',
  'Write a docker-compose.yml for a full-stack app',
  'How do I deploy a Python FastAPI app?',
  'Why is my Discord bot crashing on startup?',
  'Fix my npm install error with peer deps',
  'Set up nginx reverse proxy with SSL',
];

function modelLabel(model: string): string {
  if (!model || model === 'Detecting…') return 'Detecting model…';
  if (model.startsWith('openrouter:')) return `OpenRouter · ${model.split(':').slice(1).join(':').split('/').pop()} · Free`;
  if (model.startsWith('groq:')) return 'Groq · Llama 3.3 · Free';
  if (model.startsWith('together:')) return 'Together.ai · Mixtral · Free';
  if (model.startsWith('ollama:')) return `Ollama · ${model.split(':').slice(1).join(':') || 'llama3.2'} · Local`;
  if (model === 'huggingface') return 'HuggingFace · Free';
  if (model === 'built-in') return 'Built-in (set an API key for AI)';
  return model;
}

// Parse assistant message into Plan / Build / Verify sections
interface ParsedMsg {
  plan: string;
  build: string;
  verify: string;
  raw: string;
  hasStructure: boolean;
}

function parseStructured(content: string): ParsedMsg {
  const planMatch = content.match(/🧭\s*PLAN\s*([\s\S]*?)(?=⚙️\s*BUILD|🧪\s*VERIFY|$)/i);
  const buildMatch = content.match(/⚙️\s*BUILD\s*([\s\S]*?)(?=🧪\s*VERIFY|$)/i);
  const verifyMatch = content.match(/🧪\s*VERIFY\s*([\s\S]*?)$/i);

  const plan = planMatch ? planMatch[1].trim() : '';
  const build = buildMatch ? buildMatch[1].trim() : '';
  const verify = verifyMatch ? verifyMatch[1].trim() : '';
  const hasStructure = !!(plan || build || verify);

  return { plan, build, verify, raw: content, hasStructure };
}

function CollapsibleSection({
  icon: Icon, label, color, content, defaultOpen = false
}: {
  icon: any; label: string; color: string; content: string; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${color}30`, overflow: 'hidden', marginBottom: 6 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', background: `${color}12`, border: 'none',
          cursor: 'pointer', textAlign: 'left'
        }}
      >
        <Icon size={14} color={color} />
        <span style={{ fontSize: 12, fontWeight: 700, color, flex: 1, letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</span>
        {open ? <ChevronDown size={13} color={color} /> : <ChevronRight size={13} color={color} />}
      </button>
      {open && (
        <div style={{
          padding: '10px 12px', fontSize: 13, lineHeight: 1.7,
          color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
          wordBreak: 'break-word', background: 'var(--bg)',
          borderTop: `1px solid ${color}20`
        }}>
          {content}
        </div>
      )}
    </div>
  );
}

function MsgBubble({ m }: { m: Msg }) {
  const isUser = m.role === 'user';

  if (isUser) {
    return (
      <div style={{ display: 'flex', gap: 10, flexDirection: 'row-reverse', alignItems: 'flex-start' }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FF3C00', marginTop: 2 }}>
          <User size={15} color="#fff" />
        </div>
        <div style={{ maxWidth: '82%', padding: '10px 14px', borderRadius: '14px 14px 4px 14px', background: '#FF3C00', color: '#fff', fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {m.content}
        </div>
      </div>
    );
  }

  // Streaming state
  if (m.streaming && !m.content) {
    return (
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #5856D6, #007AFF)', marginTop: 2 }}>
          <Bot size={15} color="#fff" />
        </div>
        <div style={{ padding: '12px 16px', background: 'var(--surface)', borderRadius: '14px 14px 14px 4px', border: '1px solid var(--border)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          {[0, .2, .4].map(d => (
            <span key={d} style={{ width: 7, height: 7, borderRadius: 4, background: '#5856D6', animation: `pulse 1s infinite ${d}s`, display: 'inline-block' }} />
          ))}
        </div>
      </div>
    );
  }

  const parsed = parseStructured(m.content);

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #5856D6, #007AFF)', marginTop: 2 }}>
        <Bot size={15} color="#fff" />
      </div>
      <div style={{ maxWidth: '86%', flex: 1 }}>
        {parsed.hasStructure ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {parsed.plan && (
              <CollapsibleSection
                icon={Map} label="Plan" color="#FF9500"
                content={parsed.plan} defaultOpen={false}
              />
            )}
            {parsed.build && (
              <CollapsibleSection
                icon={Wrench} label="Build" color="#007AFF"
                content={parsed.build} defaultOpen={true}
              />
            )}
            {parsed.verify && (
              <CollapsibleSection
                icon={FlaskConical} label="Verify" color="#34C759"
                content={parsed.verify} defaultOpen={false}
              />
            )}
            {/* Fallback if only raw text after all sections */}
            {!parsed.plan && !parsed.build && !parsed.verify && (
              <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-primary)' }}>
                {m.content}
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-primary)' }}>
            {m.content || (m.streaming
              ? <span style={{ display: 'inline-flex', gap: 4, paddingTop: 4 }}>
                  {[0, .2, .4].map(d => <span key={d} style={{ width: 7, height: 7, borderRadius: 4, background: '#5856D6', animation: `pulse 1s infinite ${d}s`, display: 'inline-block' }} />)}
                </span>
              : '')}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AI() {
  // Load persisted messages from localStorage
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [model, setModel] = useState<string>('Detecting…');
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [repoToken, setRepoToken] = useState('');
  const [showRepo, setShowRepo] = useState(false);
  const [repoQuestion, setRepoQuestion] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const base = BASE();

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    try {
      // Only keep last 60 messages to avoid storage limits
      const toSave = messages.slice(-60).map(m => ({ ...m, streaming: false }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {}
  }, [messages]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    fetch(`${base}/api/ai/status`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.model) setModel(d.model); })
      .catch(() => setModel('built-in'));
  }, [base]);

  const handleFileAttach = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { setError('File too large — max 1 MB'); return; }
    try {
      const content = await file.text();
      setAttachedFile({ name: file.name, content });
      setError('');
    } catch { setError('Could not read file'); }
    e.target.value = '';
  }, []);

  const streamSSE = useCallback(async (url: string, body: object) => {
    setLoading(true);
    setError('');

    const r = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(e => { throw new Error(`Network error: ${e.message}`); });

    if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);

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
        try {
          const parsed = JSON.parse(line.slice(6));
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
    setLoading(false);
    inputRef.current?.focus();
  }, []);

  const send = useCallback(async (text?: string) => {
    const rawMsg = (text ?? input).trim();
    if (!rawMsg || loading) return;

    let msg = rawMsg;
    if (attachedFile) {
      const ext = attachedFile.name.split('.').pop() ?? '';
      msg = `[File: ${attachedFile.name}]\n\`\`\`${ext}\n${attachedFile.content.slice(0, 10000)}\n\`\`\`\n\n${rawMsg}`;
      setAttachedFile(null);
    }

    setInput('');
    const history = messages.slice(-14).map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { role: 'user', content: rawMsg, ts: Date.now() }]);

    try {
      await streamSSE(`${base}/api/ai/chat/stream`, { message: msg, history });
    } catch (e: any) {
      setError(e.message || 'AI unavailable');
      setLoading(false);
    }
  }, [input, loading, messages, attachedFile, base, streamSSE]);

  const analyzeRepo = useCallback(async () => {
    if (!repoUrl || loading) return;
    const q = repoQuestion.trim() || 'Analyze this repository. Detect the tech stack, main entry point, build commands, env variables needed, and give deployment instructions.';
    setMessages(prev => [...prev, { role: 'user', content: `🔍 Analyzing repo: ${repoUrl}\n\n${q}`, ts: Date.now() }]);
    setShowRepo(false);
    setRepoQuestion('');
    try {
      await streamSSE(`${base}/api/ai/analyze-repo`, {
        url: repoUrl, branch: 'main', token: repoToken || undefined, question: q,
      });
    } catch (e: any) {
      setError(e.message || 'Repo analysis failed');
      setLoading(false);
    }
  }, [repoUrl, repoToken, repoQuestion, loading, base, streamSSE]);

  const clearChat = () => {
    setMessages([]);
    setError('');
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  const label = modelLabel(model);

  return (
    <Shell title="AI Assistant">
      <div className="animate-rise" style={{ maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 120px)', minHeight: 500 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
          <div>
            <div className="section-title">AI Assistant</div>
            <div className="section-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={12} color="#34C759" />
              {label}
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 }}>· Responses show Plan / Build / Verify tabs</span>
            </div>
          </div>
          {messages.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={clearChat}><Trash2 size={13} /> Clear</button>
          )}
        </div>

        {/* Chat area */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0 16px' }}>
          {messages.length === 0 && (
            <div>
              <div style={{ textAlign: 'center', padding: '16px 0 20px' }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #5856D6, #007AFF)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <Sparkles size={24} color="#fff" />
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Ask anything about your deployments</div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                  Free AI — OpenRouter · Groq · Together.ai · Ollama · HuggingFace
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                  Responses include collapsible <span style={{ color: '#FF9500', fontWeight: 600 }}>Plan</span> · <span style={{ color: '#007AFF', fontWeight: 600 }}>Build</span> · <span style={{ color: '#34C759', fontWeight: 600 }}>Verify</span> sections
                </div>
              </div>

              {/* Repo analyzer promo */}
              <div className="card card-inner" style={{ marginBottom: 16, borderLeft: '3px solid #5856D6', cursor: 'pointer' }} onClick={() => setShowRepo(v => !v)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <GitBranch size={16} color="#5856D6" />
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Analyze a GitHub Repo</span>
                  <span style={{ fontSize: 11, background: '#5856D615', color: '#5856D6', borderRadius: 6, padding: '2px 7px', border: '1px solid #5856D640' }}>NEW</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Paste a repo URL → AI clones it, scans all files, detects the stack, and gives you real deployment instructions.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)} className="card card-inner"
                    style={{ textAlign: 'left', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, padding: '10px 12px', transition: 'all .15s', border: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#FF3C00')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => <MsgBubble key={i} m={m} />)}

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

        {/* Repo analyzer panel */}
        {showRepo && (
          <div className="card card-inner" style={{ flexShrink: 0, marginBottom: 12, borderTop: '2px solid #5856D6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <GitBranch size={15} color="#5856D6" />
              <span style={{ fontSize: 14, fontWeight: 700 }}>Analyze GitHub Repo</span>
              <button onClick={() => setShowRepo(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}><X size={15} /></button>
            </div>
            <input className="field" placeholder="https://github.com/user/repo" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} style={{ marginBottom: 8 }} />
            <input className="field" placeholder="GitHub token (optional, for private repos)" type="password" value={repoToken} onChange={e => setRepoToken(e.target.value)} style={{ marginBottom: 8 }} />
            <textarea className="field" placeholder="Question (optional): e.g. 'Why does npm install fail?' or 'How do I deploy this?'" value={repoQuestion} onChange={e => setRepoQuestion(e.target.value)} style={{ marginBottom: 10, minHeight: 56, resize: 'vertical' }} />
            <button className="btn btn-primary" onClick={analyzeRepo} disabled={!repoUrl || loading} style={{ background: '#5856D6' }}>
              {loading ? <><Loader2 size={14} className="spin" /> Analyzing…</> : <><FolderOpen size={14} /> Clone & Analyze Repo</>}
            </button>
          </div>
        )}

        {/* Input */}
        <div className="card card-inner" style={{ flexShrink: 0 }}>
          {attachedFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 8, background: '#007AFF15', borderRadius: 8, border: '1px solid #007AFF40' }}>
              <Paperclip size={13} color="#007AFF" />
              <span style={{ fontSize: 12, color: '#007AFF', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachedFile.name}</span>
              <button onClick={() => setAttachedFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
                <X size={13} color="#007AFF" />
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept=".txt,.md,.js,.ts,.tsx,.jsx,.py,.json,.yaml,.yml,.toml,.dockerfile,Dockerfile,.sh,.env,.gitignore,.html,.css,.go,.rb,.php" onChange={handleFileAttach} />
            <button onClick={() => fileInputRef.current?.click()} title="Attach file" style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 10, border: '1px solid var(--border)', background: attachedFile ? '#007AFF15' : 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Paperclip size={15} color={attachedFile ? '#007AFF' : 'var(--text-tertiary)'} />
            </button>
            <button onClick={() => setShowRepo(v => !v)} title="Analyze a repo" style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 10, border: '1px solid var(--border)', background: showRepo ? '#5856D615' : 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <GitBranch size={15} color={showRepo ? '#5856D6' : 'var(--text-tertiary)'} />
            </button>
            <textarea ref={inputRef} className="field" style={{ flex: 1, minHeight: 40, maxHeight: 120, resize: 'vertical', padding: '9px 12px' }}
              placeholder="Ask about deployments, errors, Dockerfiles… or attach a file / analyze a repo"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="btn btn-primary btn-icon" onClick={() => send()} disabled={(!input.trim() && !attachedFile) || loading} style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 10 }}>
              {loading ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
            Enter to send · Shift+Enter for new line · <span style={{ color: model.includes('built-in') ? '#FF9500' : '#34C759' }}>●</span> {label}
          </div>
        </div>
      </div>
    </Shell>
  );
}
