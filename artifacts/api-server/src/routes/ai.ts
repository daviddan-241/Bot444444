import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";

const router: IRouter = Router();

// ── Model priority: Ollama (free, local) → Groq (free tier) → HuggingFace → built-in
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are the AI assistant for Nezora — a personal private cloud OS.
You help with:
- Generating Dockerfiles and docker-compose.yml for any stack
- Analyzing deployment failures and logs
- Build command detection and environment variable setup
- SSL, domain, and DNS guidance
- Infrastructure optimization and cost reduction
- Kubernetes, Render, Railway, Fly.io, VPS deployment strategies
Be concise, practical, and technical. Use code blocks. Prefer free/open-source solutions.`;

// ── Ollama (runs locally or in Docker — completely free) ──────────────────────

async function callOllama(messages: OllamaMsg[]): Promise<string> {
  const r = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.message?.content || "No response";
}

async function streamOllama(messages: OllamaMsg[], onToken: (t: string) => void): Promise<void> {
  const r = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: true }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}`);
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.message?.content) onToken(obj.message.content);
      } catch {}
    }
  }
}

// ── Groq (free tier, cloud) ───────────────────────────────────────────────────

async function callGroq(messages: OllamaMsg[]): Promise<string> {
  if (!GROQ_API_KEY) throw new Error("no groq key");
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: 1024, temperature: 0.7 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content ?? "No response";
}

// ── HuggingFace (free serverless inference) ───────────────────────────────────

async function callHuggingFace(messages: OllamaMsg[]): Promise<string> {
  const prompt = messages.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n") + "\nAssistant:";
  const r = await fetch("https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 512, temperature: 0.7, return_full_text: false } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`HF ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d[0]?.generated_text?.trim() ?? builtIn(messages) : builtIn(messages);
}

// ── Built-in fallback (no network needed) ────────────────────────────────────

function builtIn(messages: OllamaMsg[]): string {
  const q = messages[messages.length - 1]?.content?.toLowerCase() ?? "";
  if (q.includes("dockerfile") || q.includes("docker")) {
    return `**Node.js Dockerfile:**\n\`\`\`dockerfile\nFROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nEXPOSE 3000\nCMD ["node", "index.js"]\n\`\`\`\n\n**Python Dockerfile:**\n\`\`\`dockerfile\nFROM python:3.11-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\nCOPY . .\nEXPOSE 8000\nCMD ["uvicorn", "main:app", "--host", "0.0.0.0"]\n\`\`\`\n\nTip: Bind to \`0.0.0.0\` and read port from \`PORT\` env var.`;
  }
  if (q.includes("deploy") || q.includes("build") || q.includes("error")) {
    return `Common deployment fixes:\n1. **Port** — listen on \`process.env.PORT\`\n2. **Build** — add a \`build\` script in package.json\n3. **Start** — add a \`start\` script\n4. **Env vars** — set in Settings before deploying\n5. **Dependencies** — use \`npm ci\` not \`npm install\``;
  }
  return `I'm your Cloud OS AI — set \`OLLAMA_HOST\` (point to a running Ollama instance) for fully free local AI with Llama 3.2, or set \`GROQ_API_KEY\` for cloud AI.\n\nI can help with:\n🐳 Dockerfiles & docker-compose\n🔍 Deployment debugging\n⚙️ Build configuration\n🌐 SSL & domain setup\n📊 Performance optimization`;
}

// ── Shared: build full message list ──────────────────────────────────────────

interface OllamaMsg { role: string; content: string; }

function buildMessages(message: string, history: any[]): OllamaMsg[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-10).map((m: any) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];
}

// Detect which model is active (for UI display)
async function detectModel(): Promise<string> {
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) return `ollama:${OLLAMA_MODEL}`;
  } catch {}
  if (GROQ_API_KEY) return GROQ_MODEL;
  return "built-in";
}

// ── POST /ai/chat — standard JSON response (mobile-friendly) ─────────────────

router.post("/ai/chat", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { message, history = [] } = req.body;
  if (!message) { res.status(400).json({ ok: false, error: "message required" }); return; }
  const messages = buildMessages(message, history);
  let reply = "";
  let model = "built-in";
  try {
    reply = await callOllama(messages);
    model = `ollama:${OLLAMA_MODEL}`;
  } catch {
    try {
      reply = await callGroq(messages);
      model = GROQ_MODEL;
    } catch {
      try {
        reply = await callHuggingFace(messages);
        model = "huggingface";
      } catch {
        reply = builtIn(messages);
      }
    }
  }
  res.json({ ok: true, reply, model });
});

// ── POST /ai/chat/stream — SSE token streaming (web, real-time typing effect) ─

router.post("/ai/chat/stream", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { message, history = [] } = req.body;
  if (!message) { res.status(400).json({ ok: false, error: "message required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: object) => { try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {} };
  const messages = buildMessages(message, history);

  try {
    // Try Ollama streaming first
    await streamOllama(messages, (token) => send({ token }));
    send({ done: true, model: `ollama:${OLLAMA_MODEL}` });
  } catch {
    // Fall back to Groq (non-streaming, then emit as one chunk)
    try {
      const reply = await callGroq(messages);
      send({ token: reply });
      send({ done: true, model: GROQ_MODEL });
    } catch {
      try {
        const reply = await callHuggingFace(messages);
        send({ token: reply });
        send({ done: true, model: "huggingface" });
      } catch {
        const reply = builtIn(messages);
        send({ token: reply });
        send({ done: true, model: "built-in" });
      }
    }
  }
  res.end();
});

// ── GET /ai/status — which model is active ────────────────────────────────────

router.get("/ai/status", async (_req, res) => {
  const model = await detectModel();
  const ollamaUp = model.startsWith("ollama");
  res.json({ ok: true, model, ollamaUp, groqConfigured: !!GROQ_API_KEY, ollamaHost: OLLAMA_HOST });
});

export default router;
