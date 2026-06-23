import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";
import { execFile } from "child_process";
import { mkdtemp, rm, readdir, stat, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

const router: IRouter = Router();

// ── Provider config ───────────────────────────────────────────────────────────
const OLLAMA_HOST  = process.env.OLLAMA_HOST   ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL  ?? "llama3.2";
const GROQ_API_KEY = process.env.GROQ_API_KEY  ?? "";
const GROQ_MODEL   = "llama-3.3-70b-versatile";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const OPENROUTER_MODEL   = process.env.OPENROUTER_MODEL   ?? "mistralai/mistral-7b-instruct:free";
const TOGETHER_API_KEY   = process.env.TOGETHER_API_KEY   ?? "";
const TOGETHER_MODEL     = "mistralai/Mixtral-8x7B-Instruct-v0.1";

// ── Agent-mode system prompt ──────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an autonomous software engineering agent embedded in Nezora — a personal private cloud OS and deployment platform.

ROLE
You plan, build, and verify solutions like a production-grade AI coding assistant. Convert user requests into working, structured outputs with minimal back-and-forth.

ALWAYS respond using this exact format for every request:

🧭 PLAN
- Summarize the task in 1–2 lines
- Break into 3–7 high-level steps
- List tools/frameworks/technologies needed
- Flag risks or unclear requirements only if relevant (keep brief)

⚙️ BUILD
Produce the full solution — working code, configs, commands, or architecture. Output must be directly runnable or usable. Prefer production-ready patterns over prototypes.

🧪 VERIFY
- Confirm the solution works logically
- List potential bugs or missing parts
- Suggest fixes or improvements

You are ALWAYS in agent mode (no need for user to request it):
- Break complex tasks into execution rounds
- Maintain project context throughout the conversation
- Incrementally improve previous outputs instead of regenerating from scratch

CODING STANDARDS
- Production-ready patterns, modular design
- Comments only when necessary
- Modern stacks (Node 20+, Python 3.11+, etc.)
- Optimize for correctness, not explanation
- Never give mock, fake, simulated, or placeholder code/responses

INTERACTION STYLE
- Direct and technical
- No fluff or motivational language
- No over-explaining unless asked
- Completion over discussion
- Make reasonable assumptions if unclear, list them in PLAN

DOMAIN EXPERTISE (Nezora-specific)
- Cloning and analyzing GitHub repos
- Auto-detecting tech stacks (Next.js, Vite, Express, FastAPI, Go, Ruby, Discord bots, Telegram bots)
- Generating Dockerfiles and docker-compose.yml for any stack
- Diagnosing build/deploy failures and npm/pip/cargo errors
- Env var configuration, port binding, process management
- SSL, nginx, domain/DNS setup
- Render, Railway, Fly.io, VPS deployment strategies
- Fix node-gyp failures (remove native deps, use Docker, use Alpine-compatible alternatives)`;

interface Msg { role: string; content: string; }

// ── OpenRouter (free tier) ────────────────────────────────────────────────────
async function callOpenRouter(messages: Msg[]): Promise<string> {
  if (!OPENROUTER_API_KEY) throw new Error("no key");
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://nezora.app", "X-Title": "Nezora Cloud OS" },
    body: JSON.stringify({ model: OPENROUTER_MODEL, messages, max_tokens: 4096, temperature: 0.7 }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content ?? "No response";
}

// ── Groq (free tier) ──────────────────────────────────────────────────────────
async function callGroq(messages: Msg[]): Promise<string> {
  if (!GROQ_API_KEY) throw new Error("no key");
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: 4096, temperature: 0.7 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content ?? "No response";
}

// ── Together.ai (free tier) ───────────────────────────────────────────────────
async function callTogether(messages: Msg[]): Promise<string> {
  if (!TOGETHER_API_KEY) throw new Error("no key");
  const r = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${TOGETHER_API_KEY}` },
    body: JSON.stringify({ model: TOGETHER_MODEL, messages, max_tokens: 4096, temperature: 0.7 }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error(`Together ${r.status}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content ?? "No response";
}

// ── Ollama (local/self-hosted) ────────────────────────────────────────────────
async function callOllama(messages: Msg[]): Promise<string> {
  const r = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}`);
  const d = await r.json();
  return d.message?.content ?? "No response";
}

async function streamOllama(messages: Msg[], onToken: (t: string) => void): Promise<void> {
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
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try { const o = JSON.parse(line); if (o.message?.content) onToken(o.message.content); } catch {}
    }
  }
}

// ── HuggingFace (no key needed) ───────────────────────────────────────────────
async function callHuggingFace(messages: Msg[]): Promise<string> {
  const prompt = messages.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n") + "\nAssistant:";
  const r = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 800, temperature: 0.7, return_full_text: false } }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error(`HF ${r.status}`);
  const d = await r.json();
  const text = Array.isArray(d) ? d[0]?.generated_text?.trim() : null;
  if (!text) throw new Error("empty");
  return text;
}

// ── Built-in fallback ─────────────────────────────────────────────────────────
function builtIn(messages: Msg[]): string {
  const q = messages[messages.length - 1]?.content?.toLowerCase() ?? "";

  if (q.includes("dockerfile") || q.includes("docker")) {
    return `🧭 PLAN\n- Generate Dockerfiles for Node.js and Python stacks\n- Steps: 1. Choose base image 2. Copy deps 3. Install 4. Copy source 5. Expose port 6. Set CMD\n\n⚙️ BUILD\n\n**Node.js:**\n\`\`\`dockerfile\nFROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nEXPOSE 3000\nCMD ["node", "index.js"]\n\`\`\`\n\n**Python (FastAPI):**\n\`\`\`dockerfile\nFROM python:3.11-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 8000\nCMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]\n\`\`\`\n\n🧪 VERIFY\n- Bind to 0.0.0.0, not localhost\n- Read port from PORT env var: \`process.env.PORT || 3000\`\n- Use multi-stage builds for smaller images`;
  }

  if (q.includes("node-gyp") || q.includes("native")) {
    return `🧭 PLAN\n- Fix native module compilation failure\n- Root cause: node-gyp needs build tools (python, make, g++) which Render/Alpine doesn't have\n\n⚙️ BUILD\n\nOption 1 — Use Alpine-compatible alternatives:\n\`\`\`bash\n# Instead of node-pty → use node-pty-prebuilt-multiarch\nnpm uninstall node-pty\nnpm install node-pty-prebuilt-multiarch\n\`\`\`\n\nOption 2 — Use Debian base in Docker:\n\`\`\`dockerfile\nFROM node:20  # not node:20-alpine\nRUN apt-get update && apt-get install -y python3 make g++\n\`\`\`\n\nOption 3 — Use prebuilt binaries:\n\`\`\`json\n// package.json\n{\n  "scripts": {\n    "install": "npm rebuild || true"\n  }\n}\n\`\`\`\n\n🧪 VERIFY\n- Check if the native module has a pure-JS fallback\n- If using node-pty for terminal emulation, consider xterm.js + WebSockets instead`;
  }

  return `🧭 PLAN\n- No AI provider configured yet\n- Set one of these free API keys to unlock full agent capabilities\n\n⚙️ BUILD\n\nSet these in your Render environment variables:\n\n| Provider | Env Var | Model | Sign Up |\n|---|---|---|---|\n| OpenRouter | OPENROUTER_API_KEY | mistral-7b:free | openrouter.ai |\n| Groq | GROQ_API_KEY | llama-3.3-70b | console.groq.com |\n| Together.ai | TOGETHER_API_KEY | Mixtral-8x7B | api.together.xyz |\n| Ollama | OLLAMA_HOST | any local model | ollama.ai |\n\nAll are free with no credit card required.\n\n🧪 VERIFY\n- After setting the key on Render, click "Manual Deploy"\n- The AI status indicator will turn green`;
}

// ── Try all providers in priority order ───────────────────────────────────────
async function callAI(messages: Msg[]): Promise<{ reply: string; model: string }> {
  const order: Array<() => Promise<{ reply: string; model: string }>> = [
    async () => ({ reply: await callOpenRouter(messages), model: `openrouter:${OPENROUTER_MODEL}` }),
    async () => ({ reply: await callGroq(messages), model: `groq:${GROQ_MODEL}` }),
    async () => ({ reply: await callTogether(messages), model: `together:${TOGETHER_MODEL}` }),
    async () => ({ reply: await callOllama(messages), model: `ollama:${OLLAMA_MODEL}` }),
    async () => ({ reply: await callHuggingFace(messages), model: "huggingface" }),
  ];
  for (const fn of order) {
    try { return await fn(); } catch {}
  }
  return { reply: builtIn(messages), model: "built-in" };
}

function buildMessages(message: string, history: any[]): Msg[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-14).map((m: any) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];
}

async function detectModel(): Promise<string> {
  if (OPENROUTER_API_KEY) return `openrouter:${OPENROUTER_MODEL}`;
  if (GROQ_API_KEY) return `groq:${GROQ_MODEL}`;
  if (TOGETHER_API_KEY) return `together:${TOGETHER_MODEL}`;
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) return `ollama:${OLLAMA_MODEL}`;
  } catch {}
  return "built-in";
}

// ── POST /ai/chat ─────────────────────────────────────────────────────────────
router.post("/ai/chat", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { message, history = [] } = req.body;
  if (!message) { res.status(400).json({ ok: false, error: "message required" }); return; }
  const { reply, model } = await callAI(buildMessages(message, history));
  res.json({ ok: true, reply, model });
});

// ── POST /ai/chat/stream — SSE streaming ──────────────────────────────────────
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

  // Try Ollama streaming first if local Ollama is up
  try {
    const check = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (check.ok) {
      try {
        await streamOllama(messages, (t) => send({ token: t }));
        send({ done: true, model: `ollama:${OLLAMA_MODEL}` });
        res.end(); return;
      } catch {}
    }
  } catch {}

  // Non-streaming providers — fake stream for smooth UX
  const { reply, model } = await callAI(messages);
  const words = reply.split(" ");
  for (let i = 0; i < words.length; i += 5) {
    send({ token: words.slice(i, i + 5).join(" ") + (i + 5 < words.length ? " " : "") });
    await new Promise(r => setTimeout(r, 18));
  }
  send({ done: true, model });
  res.end();
});

// ── GET /ai/status ────────────────────────────────────────────────────────────
router.get("/ai/status", async (_req, res) => {
  const model = await detectModel();
  res.json({
    ok: true, model,
    providers: {
      openrouter: !!OPENROUTER_API_KEY,
      groq: !!GROQ_API_KEY,
      together: !!TOGETHER_API_KEY,
      ollamaHost: OLLAMA_HOST,
    },
  });
});

// ── Repo analysis helpers ─────────────────────────────────────────────────────
function runCmd(cmd: string, args: string[], cwd: string, timeout = 60_000) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(cmd, args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ code: (error as any)?.code ?? (error ? 1 : 0), stdout, stderr: stderr || String(error?.message || "") });
    });
  });
}

async function walkRepo(dir: string, root = dir, maxFiles = 300): Promise<string[]> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  const out: string[] = [];
  const skip = [".git", "node_modules", ".next", "dist", "build", "__pycache__", ".venv", ".yarn", "vendor"];
  for (const e of entries) {
    if (skip.includes(e)) continue;
    const full = path.join(dir, e);
    const s = await stat(full).catch(() => null);
    if (!s) continue;
    if (s.isDirectory()) out.push(...await walkRepo(full, root, maxFiles));
    else out.push(path.relative(root, full));
    if (out.length >= maxFiles) break;
  }
  return out;
}

async function readSafe(file: string, maxChars = 4000): Promise<string> {
  try { return (await readFile(file, "utf8")).slice(0, maxChars); } catch { return ""; }
}

// ── POST /ai/analyze-repo ─────────────────────────────────────────────────────
router.post("/ai/analyze-repo", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { url, branch = "main", token, question = "Analyze this repository. Detect the tech stack, main entry point, build commands, environment variables needed, and give complete deployment instructions for Render.com." } = req.body;
  if (!url) { res.status(400).json({ ok: false, error: "url is required" }); return; }

  const cloneUrl = token ? url.replace("https://", `https://x-access-token:${token}@`) : url;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: object) => { try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {} };
  const work = await mkdtemp(path.join(tmpdir(), "nezora-ai-repo-"));

  try {
    send({ token: `🧭 PLAN\n- Clone: ${url}\n- Scan files and read key configs\n- Analyze with AI agent\n\n` });

    const clone = await runCmd("git", ["clone", "--depth", "1", "--branch", branch, cloneUrl, "source"], work, 60_000);
    if (clone.code !== 0) {
      // Try main/master fallback
      const retry = await runCmd("git", ["clone", "--depth", "1", cloneUrl, "source"], work, 60_000);
      if (retry.code !== 0) {
        send({ token: `❌ Clone failed: ${clone.stderr.slice(0, 300)}` });
        send({ done: true, model: "system" });
        res.end(); return;
      }
    }

    const sourceDir = path.join(work, "source");
    const files = await walkRepo(sourceDir);
    send({ token: `⚙️ BUILD\n📁 Scanned ${files.length} files. Reading configs…\n` });

    const keyFiles = ["package.json", "requirements.txt", "Dockerfile", "docker-compose.yml",
      "go.mod", "Cargo.toml", "pom.xml", ".env.example", "README.md", "render.yaml",
      "index.js", "index.ts", "main.py", "app.py", "server.py", "main.go", "Pipfile", "pyproject.toml"];

    const contents: Record<string, string> = {};
    for (const f of keyFiles) {
      const c = await readSafe(path.join(sourceDir, f));
      if (c) contents[f] = c;
    }

    const repoCtx = `Repository URL: ${url}\nFile tree (${files.length} files):\n${files.slice(0, 100).join("\n")}\n\n${Object.entries(contents).map(([f, c]) => `=== ${f} ===\n${c}`).join("\n\n")}`;

    send({ token: `\n🤖 Analyzing with AI agent…\n\n` });

    const msgs: Msg[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `${repoCtx}\n\n---\n\nUser question: ${question}` },
    ];

    const { reply, model } = await callAI(msgs);
    const words = reply.split(" ");
    for (let i = 0; i < words.length; i += 4) {
      send({ token: words.slice(i, i + 4).join(" ") + (i + 4 < words.length ? " " : "") });
      await new Promise(r => setTimeout(r, 15));
    }
    send({ done: true, model });
  } catch (e: any) {
    send({ token: `\n❌ Error: ${e.message}` });
    send({ done: true, model: "error" });
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
    res.end();
  }
});

export default router;
