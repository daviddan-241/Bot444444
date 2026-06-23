import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";
import { execFile } from "child_process";
import { mkdtemp, rm, readdir, stat, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

const router: IRouter = Router();

// ── Model priority: OpenRouter free → Groq → Ollama → HuggingFace → built-in
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "mistralai/mistral-7b-instruct:free";
const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY ?? "";
const TOGETHER_MODEL = "mistralai/Mixtral-8x7B-Instruct-v0.1";

const SYSTEM_PROMPT = `You are the AI assistant for Nezora — a personal private cloud OS and deployment platform.
You help with:
- Analyzing repos, files, and codebases — detecting frameworks, build commands, and runtime requirements
- Generating Dockerfiles and docker-compose.yml for any stack
- Analyzing deployment failures and logs — finding root causes
- Build command detection and environment variable setup
- SSL, domain, and DNS guidance
- Infrastructure optimization and cost reduction
- Kubernetes, Render, Railway, Fly.io, VPS deployment strategies
- Writing and fixing code, generating configs and scripts
- Repository scanning: understanding file structure, tech stack, entry points
Be concise, practical, and technical. Use code blocks. Prefer free/open-source solutions. Never give mock or placeholder responses — always provide real, working code and commands.`;

interface OllamaMsg { role: string; content: string; }

// ── OpenRouter (free tier — many free models, no card required) ───────────────
async function callOpenRouter(messages: OllamaMsg[]): Promise<string> {
  if (!OPENROUTER_API_KEY) throw new Error("no openrouter key");
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://nezora.app",
      "X-Title": "Nezora Cloud OS",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      max_tokens: 2048,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content ?? "No response";
}

// ── Groq (free tier, fast, cloud) ────────────────────────────────────────────
async function callGroq(messages: OllamaMsg[]): Promise<string> {
  if (!GROQ_API_KEY) throw new Error("no groq key");
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: 2048, temperature: 0.7 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content ?? "No response";
}

// ── Together.ai (free tier) ───────────────────────────────────────────────────
async function callTogether(messages: OllamaMsg[]): Promise<string> {
  if (!TOGETHER_API_KEY) throw new Error("no together key");
  const r = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${TOGETHER_API_KEY}` },
    body: JSON.stringify({ model: TOGETHER_MODEL, messages, max_tokens: 2048, temperature: 0.7 }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error(`Together ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content ?? "No response";
}

// ── Ollama (runs locally or in Docker — completely free) ──────────────────────
async function callOllama(messages: OllamaMsg[]): Promise<string> {
  const r = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false }),
    signal: AbortSignal.timeout(90_000),
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

// ── HuggingFace (free serverless inference) ───────────────────────────────────
async function callHuggingFace(messages: OllamaMsg[]): Promise<string> {
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
  if (!text) throw new Error("HF empty response");
  return text;
}

// ── Built-in fallback (no network needed) ─────────────────────────────────────
function builtIn(messages: OllamaMsg[]): string {
  const q = messages[messages.length - 1]?.content?.toLowerCase() ?? "";
  if (q.includes("dockerfile") || q.includes("docker")) {
    return `**Node.js Dockerfile:**\n\`\`\`dockerfile\nFROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nEXPOSE 3000\nCMD ["node", "index.js"]\n\`\`\`\n\n**Python Dockerfile:**\n\`\`\`dockerfile\nFROM python:3.11-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\nCOPY . .\nEXPOSE 8000\nCMD ["uvicorn", "main:app", "--host", "0.0.0.0"]\n\`\`\`\n\nTip: Bind to \`0.0.0.0\` and read port from \`PORT\` env var.`;
  }
  if (q.includes("deploy") || q.includes("build") || q.includes("error")) {
    return `Common deployment fixes:\n1. **Port** — listen on \`process.env.PORT\`\n2. **Build** — add a \`build\` script in package.json\n3. **Start** — add a \`start\` script\n4. **Env vars** — set in the env panel before deploying\n5. **native modules** — if node-gyp fails, remove native deps or use Docker`;
  }
  return `I'm Nezora AI — configure a free AI provider to get smart responses:\n\n**Free options (set in Settings → AI):**\n• **OpenRouter** — \`OPENROUTER_API_KEY\` — many free models (Mistral, Llama, Gemma)\n• **Groq** — \`GROQ_API_KEY\` — fast Llama 3.3 70B\n• **Together.ai** — \`TOGETHER_API_KEY\` — Mixtral 8x7B\n• **Ollama** — \`OLLAMA_HOST\` — fully local & free\n\nI can also analyze your GitHub repos and files!`;
}

// ── Try all providers in order ────────────────────────────────────────────────
async function callAI(messages: OllamaMsg[]): Promise<{ reply: string; model: string }> {
  const providers: Array<() => Promise<{ reply: string; model: string }>> = [
    async () => ({ reply: await callOpenRouter(messages), model: `openrouter:${OPENROUTER_MODEL}` }),
    async () => ({ reply: await callGroq(messages), model: `groq:${GROQ_MODEL}` }),
    async () => ({ reply: await callTogether(messages), model: `together:${TOGETHER_MODEL}` }),
    async () => ({ reply: await callOllama(messages), model: `ollama:${OLLAMA_MODEL}` }),
    async () => ({ reply: await callHuggingFace(messages), model: "huggingface" }),
  ];
  for (const fn of providers) {
    try { return await fn(); } catch {}
  }
  return { reply: builtIn(messages), model: "built-in" };
}

// ── Shared: build full message list ──────────────────────────────────────────
function buildMessages(message: string, history: any[]): OllamaMsg[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-12).map((m: any) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];
}

// ── Detect which models are active ───────────────────────────────────────────
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

// ── POST /ai/chat — standard JSON response ────────────────────────────────────
router.post("/ai/chat", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { message, history = [] } = req.body;
  if (!message) { res.status(400).json({ ok: false, error: "message required" }); return; }
  const messages = buildMessages(message, history);
  const { reply, model } = await callAI(messages);
  res.json({ ok: true, reply, model });
});

// ── POST /ai/chat/stream — SSE token streaming ────────────────────────────────
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

  // Try Ollama streaming first if available
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) {
      try {
        await streamOllama(messages, (token) => send({ token }));
        send({ done: true, model: `ollama:${OLLAMA_MODEL}` });
        res.end(); return;
      } catch {}
    }
  } catch {}

  // Fall back to non-streaming providers
  const { reply, model } = await callAI(messages);
  // Stream token by token for a nice typing effect
  const words = reply.split(" ");
  for (let i = 0; i < words.length; i += 4) {
    send({ token: words.slice(i, i + 4).join(" ") + (i + 4 < words.length ? " " : "") });
    await new Promise(r => setTimeout(r, 20));
  }
  send({ done: true, model });
  res.end();
});

// ── GET /ai/status — which model is active ────────────────────────────────────
router.get("/ai/status", async (_req, res) => {
  const model = await detectModel();
  res.json({
    ok: true,
    model,
    providers: {
      openrouter: !!OPENROUTER_API_KEY,
      groq: !!GROQ_API_KEY,
      together: !!TOGETHER_API_KEY,
      ollama: OLLAMA_HOST,
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

async function walkRepo(dir: string, root = dir, maxFiles = 200): Promise<string[]> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  const out: string[] = [];
  for (const e of entries) {
    if ([".git", "node_modules", ".next", "dist", "build", "__pycache__", ".venv"].includes(e)) continue;
    const full = path.join(dir, e);
    const s = await stat(full).catch(() => null);
    if (!s) continue;
    if (s.isDirectory()) out.push(...await walkRepo(full, root, maxFiles));
    else out.push(path.relative(root, full));
    if (out.length >= maxFiles) break;
  }
  return out;
}

async function readSafe(file: string, maxChars = 3000): Promise<string> {
  try { return (await readFile(file, "utf8")).slice(0, maxChars); } catch { return ""; }
}

// ── POST /ai/analyze-repo — clone a GitHub repo and analyze it ───────────────
router.post("/ai/analyze-repo", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { url, branch = "main", token, question = "Analyze this repository. Detect the tech stack, main entry point, build commands, environment variables needed, and give deployment instructions." } = req.body;
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
    send({ token: `🔍 Cloning ${url}…\n` });
    const clone = await runCmd("git", ["clone", "--depth", "1", "--branch", branch, cloneUrl, "source"], work, 60_000);
    if (clone.code !== 0) {
      send({ token: `❌ Clone failed: ${clone.stderr.slice(0, 300)}` });
      send({ done: true, model: "system" });
      res.end(); return;
    }

    const sourceDir = path.join(work, "source");
    const files = await walkRepo(sourceDir);
    send({ token: `📁 Found ${files.length} files. Reading key files…\n` });

    // Read important files
    const keyFiles: Record<string, string> = {};
    const importantFiles = ["package.json", "requirements.txt", "Dockerfile", "docker-compose.yml",
      "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "Pipfile", ".env.example",
      "README.md", "index.js", "index.ts", "main.py", "app.py", "server.py", "main.go"];
    for (const f of importantFiles) {
      const content = await readSafe(path.join(sourceDir, f));
      if (content) keyFiles[f] = content;
    }

    const repoContext = `Repository: ${url}\nFiles (${files.length} total):\n${files.slice(0, 80).join("\n")}\n\n${Object.entries(keyFiles).map(([f, c]) => `=== ${f} ===\n${c}`).join("\n\n")}`;

    send({ token: `🤖 Analyzing with AI…\n\n` });

    const messages: OllamaMsg[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `${repoContext}\n\n---\n\nUser question: ${question}` },
    ];

    const { reply, model } = await callAI(messages);
    // Stream the reply
    const words = reply.split(" ");
    for (let i = 0; i < words.length; i += 3) {
      send({ token: words.slice(i, i + 3).join(" ") + (i + 3 < words.length ? " " : "") });
      await new Promise(r => setTimeout(r, 15));
    }
    send({ done: true, model });
  } catch (e: any) {
    send({ token: `❌ Error: ${e.message}` });
    send({ done: true, model: "error" });
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
    res.end();
  }
});

export default router;
