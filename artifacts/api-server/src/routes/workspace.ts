import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";
import { processManager } from "../lib/process-manager";
import { deployQueue } from "../lib/deploy-queue";
import path from "path";
import { readFile, writeFile, readdir, stat, mkdir, rm } from "fs/promises";
import { execFile } from "child_process";
import { APP_ROOT } from "./app-deploy";

const router: IRouter = Router();

const SKIP = new Set([".git", "node_modules", "__pycache__", ".venv", "vendor",
  ".next", "dist", "build", ".yarn", "target", ".cargo"]);

async function walkDir(dir: string, root: string, max = 300): Promise<string[]> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  const out: string[] = [];
  for (const e of entries) {
    if (SKIP.has(e)) continue;
    const full = path.join(dir, e);
    const s = await stat(full).catch(() => null);
    if (!s) continue;
    if (s.isDirectory()) out.push(...await walkDir(full, root, max));
    else out.push(path.relative(root, full));
    if (out.length >= max) break;
  }
  return out;
}

function shellInDir(cwd: string, cmd: string, timeout = 90_000) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile("sh", ["-c", cmd], {
      cwd, timeout, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: "0" },
    }, (err, stdout, stderr) => {
      resolve({
        code: (err as any)?.code ?? (err ? 1 : 0),
        stdout: stdout.slice(0, 8000),
        stderr: stderr.slice(0, 3000),
      });
    });
  });
}

function resolveWorkspaceDir(slug: string): string {
  return path.join(APP_ROOT, slug);
}

function safePath(wsDir: string, rel: string): string | null {
  const abs = path.resolve(wsDir, rel);
  if (!abs.startsWith(wsDir)) return null;
  return abs;
}

// ── GET /api/real/workspaces ─────────────────────────────────────────────────
router.get("/real/workspaces", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const processes = processManager.list();
  const workspaces = processes.map(p => ({
    id: p.id, name: p.name, status: p.status,
    url: p.url, framework: p.framework, language: p.language,
    port: p.port, restarts: p.restarts,
  }));
  res.json({ ok: true, workspaces });
});

// ── GET /api/real/workspaces/:slug ───────────────────────────────────────────
router.get("/real/workspaces/:slug", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { slug } = req.params;
  const proc = processManager.get(slug);
  if (!proc) { res.status(404).json({ ok: false, error: "App not found" }); return; }

  const wsDir = resolveWorkspaceDir(slug);
  const [files] = await Promise.all([walkDir(wsDir, wsDir, 300)]);

  res.json({
    ok: true,
    workspace: {
      id: proc.id, name: proc.name, status: proc.status,
      url: proc.url, framework: proc.framework, language: proc.language,
      port: proc.port, restarts: proc.restarts, cwd: wsDir,
      files, recentLogs: proc.logs.slice(-100),
    },
  });
});

// ── POST /api/real/workspaces/:slug/files/list ───────────────────────────────
router.post("/real/workspaces/:slug/files/list", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { slug } = req.params;
  const { dir = "" } = req.body;
  const wsDir = resolveWorkspaceDir(slug);
  const target = dir ? safePath(wsDir, dir) : wsDir;
  if (!target) { res.status(400).json({ ok: false, error: "Invalid path" }); return; }

  const entries = await readdir(target, { withFileTypes: true }).catch(() => []);
  const items = await Promise.all(
    entries.filter(e => !SKIP.has(e.name)).map(async e => {
      const s = await stat(path.join(target, e.name)).catch(() => null);
      return { name: e.name, type: e.isDirectory() ? "dir" : "file", size: s?.size ?? 0 };
    })
  );
  items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
  res.json({ ok: true, dir: dir || "/", items });
});

// ── POST /api/real/workspaces/:slug/files/read ───────────────────────────────
router.post("/real/workspaces/:slug/files/read", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { slug } = req.params;
  const { path: filePath } = req.body;
  if (!filePath) { res.status(400).json({ ok: false, error: "path required" }); return; }
  const wsDir = resolveWorkspaceDir(slug);
  const abs = safePath(wsDir, filePath);
  if (!abs) { res.status(400).json({ ok: false, error: "Invalid path" }); return; }

  const content = await readFile(abs, "utf8").catch(() => null);
  if (content === null) { res.status(404).json({ ok: false, error: "File not found" }); return; }
  res.json({ ok: true, path: filePath, content: content.slice(0, 200_000) });
});

// ── POST /api/real/workspaces/:slug/files/write ──────────────────────────────
router.post("/real/workspaces/:slug/files/write", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { slug } = req.params;
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) { res.status(400).json({ ok: false, error: "path and content required" }); return; }
  const wsDir = resolveWorkspaceDir(slug);
  const abs = safePath(wsDir, filePath);
  if (!abs) { res.status(400).json({ ok: false, error: "Invalid path" }); return; }

  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
  res.json({ ok: true, path: filePath, bytesWritten: Buffer.byteLength(content, "utf8") });
});

// ── POST /api/real/workspaces/:slug/shell — streaming SSE shell ──────────────
router.post("/real/workspaces/:slug/shell", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { slug } = req.params;
  const { command } = req.body;
  if (!command) { res.status(400).json({ ok: false, error: "command required" }); return; }

  const wsDir = resolveWorkspaceDir(slug);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (d: object) => { try { res.write(`data: ${JSON.stringify(d)}\n\n`); } catch {} };
  send({ type: "start", command });

  const result = await shellInDir(wsDir, command);
  if (result.stdout) send({ type: "stdout", text: result.stdout });
  if (result.stderr) send({ type: "stderr", text: result.stderr });
  send({ type: "done", code: result.code });
  res.end();
});

// ── POST /api/real/workspaces/:slug/redeploy ─────────────────────────────────
router.post("/real/workspaces/:slug/redeploy", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { slug } = req.params;
  const proc = processManager.get(slug);
  if (!proc) { res.status(404).json({ ok: false, error: "App not found" }); return; }

  await processManager.kill(slug).catch(() => {});
  await processManager.spawn({
    id: proc.id, name: proc.name, command: proc.command,
    args: proc.args, cwd: proc.cwd, env: proc.env,
    framework: proc.framework, language: proc.language, url: proc.url,
  });
  res.json({ ok: true, message: "App restarted" });
});

// ── AI Agent system prompt ────────────────────────────────────────────────────
function agentSystemPrompt(appName: string, files: string[], framework?: string): string {
  return `You are an autonomous coding agent embedded in Nezora for the "${appName}" workspace.
Framework: ${framework ?? "unknown"}
Files in workspace (${files.length} total):
${files.slice(0, 80).join("\n")}

You can call tools to inspect and modify this project. Use this EXACT format:

<tool:list_files>{"dir": "src"}</tool>
<tool:read_file>{"path": "src/index.ts"}</tool>
<tool:write_file>{"path": "src/fix.ts", "content": "// fixed code here"}</tool>
<tool:run_command>{"command": "npm install && npm run build"}</tool>
<tool:get_logs>{}</tool>

Rules:
- Call one tool at a time, wait for its result, then continue
- After using tools, always explain what you did and what you found
- For write_file: always read the file first, then write the complete updated version
- Never truncate file contents when writing
- When fixing errors: run_command to reproduce, read relevant files, write the fix, run again to verify
- Be concise in explanations, verbose in code`;
}

// ── Tool executor ─────────────────────────────────────────────────────────────
async function executeTool(
  slug: string, wsDir: string, toolName: string, params: any
): Promise<string> {
  try {
    switch (toolName) {
      case "list_files": {
        const dir = params.dir || "";
        const target = dir ? safePath(wsDir, dir) : wsDir;
        if (!target) return "ERROR: Invalid path";
        const entries = await readdir(target, { withFileTypes: true }).catch(() => []);
        const items = entries.filter(e => !SKIP.has(e.name)).map(e =>
          `${e.isDirectory() ? "📁" : "📄"} ${e.name}`
        );
        return items.length > 0 ? items.join("\n") : "(empty directory)";
      }

      case "read_file": {
        const rel = params.path;
        if (!rel) return "ERROR: path required";
        const abs = safePath(wsDir, rel);
        if (!abs) return "ERROR: Invalid path";
        const content = await readFile(abs, "utf8").catch(() => null);
        if (content === null) return `ERROR: File not found: ${rel}`;
        const lines = content.split("\n");
        const preview = lines.slice(0, 200).join("\n");
        return `${rel} (${lines.length} lines):\n\`\`\`\n${preview}\n\`\`\`${lines.length > 200 ? `\n... (${lines.length - 200} more lines)` : ""}`;
      }

      case "write_file": {
        const rel = params.path;
        const content = params.content;
        if (!rel || content === undefined) return "ERROR: path and content required";
        const abs = safePath(wsDir, rel);
        if (!abs) return "ERROR: Invalid path";
        await mkdir(path.dirname(abs), { recursive: true });
        await writeFile(abs, content, "utf8");
        return `✅ Written ${Buffer.byteLength(content, "utf8")} bytes to ${rel}`;
      }

      case "run_command": {
        const cmd = params.command;
        if (!cmd) return "ERROR: command required";
        const result = await shellInDir(wsDir, cmd, 120_000);
        const out = [
          result.stdout ? `STDOUT:\n${result.stdout}` : "",
          result.stderr ? `STDERR:\n${result.stderr}` : "",
          `Exit code: ${result.code}`,
        ].filter(Boolean).join("\n");
        return out;
      }

      case "get_logs": {
        const proc = processManager.get(slug);
        if (!proc) return "App not running";
        const logs = proc.logs.slice(-50);
        return logs.length > 0 ? logs.join("\n") : "(no logs yet)";
      }

      default:
        return `ERROR: Unknown tool: ${toolName}`;
    }
  } catch (e: any) {
    return `ERROR: ${e.message}`;
  }
}

// ── Tool call parser ──────────────────────────────────────────────────────────
const TOOL_RE = /<tool:(\w+)>([\s\S]*?)<\/tool>/;

function parseToolCall(text: string): { toolName: string; params: any; match: string } | null {
  const m = TOOL_RE.exec(text);
  if (!m) return null;
  try {
    return { toolName: m[1], params: JSON.parse(m[2] || "{}"), match: m[0] };
  } catch {
    return { toolName: m[1], params: {}, match: m[0] };
  }
}

// ── AI caller (re-uses same providers) ───────────────────────────────────────
interface Msg { role: string; content: string; }

async function callProvider(messages: Msg[]): Promise<string> {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
  const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
  const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY ?? "";

  const tryFetch = async (url: string, headers: Record<string, string>, body: object) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json() as any;
    return (d.choices?.[0]?.message?.content ?? d.message?.content ?? "") as string;
  };

  if (OPENROUTER_API_KEY) {
    try {
      return await tryFetch("https://openrouter.ai/api/v1/chat/completions",
        { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://nezora.app", "X-Title": "Nezora" },
        { model: process.env.OPENROUTER_MODEL ?? "mistralai/mistral-7b-instruct:free", messages, max_tokens: 3000, temperature: 0.4 });
    } catch {}
  }
  if (GROQ_API_KEY) {
    try {
      return await tryFetch("https://api.groq.com/openai/v1/chat/completions",
        { "Authorization": `Bearer ${GROQ_API_KEY}` },
        { model: "llama-3.3-70b-versatile", messages, max_tokens: 3000, temperature: 0.4 });
    } catch {}
  }
  if (TOGETHER_API_KEY) {
    try {
      return await tryFetch("https://api.together.xyz/v1/chat/completions",
        { "Authorization": `Bearer ${TOGETHER_API_KEY}` },
        { model: "mistralai/Mixtral-8x7B-Instruct-v0.1", messages, max_tokens: 3000, temperature: 0.4 });
    } catch {}
  }
  return "No AI provider configured. Set OPENROUTER_API_KEY, GROQ_API_KEY, or TOGETHER_API_KEY.";
}

// ── POST /api/real/workspaces/:slug/agent — SSE agent loop ───────────────────
router.post("/real/workspaces/:slug/agent", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { slug } = req.params;
  const { message, history = [] } = req.body;
  if (!message) { res.status(400).json({ ok: false, error: "message required" }); return; }

  const proc = processManager.get(slug);
  if (!proc) { res.status(404).json({ ok: false, error: "App not found" }); return; }

  const wsDir = resolveWorkspaceDir(slug);
  const files = await walkDir(wsDir, wsDir, 200);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (d: object) => { try { res.write(`data: ${JSON.stringify(d)}\n\n`); } catch {} };

  const systemMsg: Msg = { role: "system", content: agentSystemPrompt(proc.name, files, proc.framework) };
  const msgs: Msg[] = [
    systemMsg,
    ...history.slice(-10).map((m: any) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  let round = 0;
  const MAX_ROUNDS = 8;

  while (round < MAX_ROUNDS) {
    round++;
    send({ type: "thinking", round });

    const reply = await callProvider(msgs);
    if (!reply) { send({ type: "error", text: "AI provider returned empty response" }); break; }

    const toolCall = parseToolCall(reply);
    if (!toolCall) {
      const words = reply.split(" ");
      for (let i = 0; i < words.length; i += 6) {
        send({ type: "token", text: words.slice(i, i + 6).join(" ") + (i + 6 < words.length ? " " : "") });
        await new Promise(r => setTimeout(r, 12));
      }
      send({ type: "done", rounds: round });
      break;
    }

    const textBefore = reply.slice(0, reply.indexOf(toolCall.match)).trim();
    if (textBefore) {
      const words = textBefore.split(" ");
      for (let i = 0; i < words.length; i += 6) {
        send({ type: "token", text: words.slice(i, i + 6).join(" ") + " " });
        await new Promise(r => setTimeout(r, 10));
      }
    }

    send({ type: "tool_call", tool: toolCall.toolName, params: toolCall.params });
    const toolResult = await executeTool(slug, wsDir, toolCall.toolName, toolCall.params);
    send({ type: "tool_result", tool: toolCall.toolName, result: toolResult.slice(0, 4000) });

    msgs.push({ role: "assistant", content: reply });
    msgs.push({ role: "user", content: `Tool result for ${toolCall.toolName}:\n${toolResult}\n\nContinue with the task.` });
  }

  if (round >= MAX_ROUNDS) {
    send({ type: "token", text: "\n\n(Agent reached maximum rounds. Type another message to continue.)" });
    send({ type: "done", rounds: round });
  }

  res.end();
});

export default router;
