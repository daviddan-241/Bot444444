import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";

const router: IRouter = Router();

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are the AI assistant for Danny's Cloud OS — a personal private cloud operating system.
You help the owner (Danny) with:
- Analyzing deployment failures and logs
- Generating Dockerfiles and runtime configurations
- Explaining build errors and suggesting fixes  
- Infrastructure optimization advice
- Environment variable configuration
- Framework detection and build commands
- SSL, domain, and DNS guidance
Be concise, practical, and technical. Use code blocks when relevant. Default to free/open-source solutions.`;

async function callGroq(messages: any[]): Promise<string> {
  if (!GROQ_API_KEY) {
    return callFallbackLLM(messages);
  }
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Groq API error ${r.status}: ${err}`);
  }
  const d = await r.json();
  return d.choices?.[0]?.message?.content || "No response";
}

async function callFallbackLLM(messages: any[]): Promise<string> {
  try {
    const r = await fetch("https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: messages.map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') + '\nAssistant:',
        parameters: { max_new_tokens: 512, temperature: 0.7, return_full_text: false },
      }),
    });
    if (r.ok) {
      const d = await r.json();
      return Array.isArray(d) ? d[0]?.generated_text?.trim() || generateLocalResponse(messages) : generateLocalResponse(messages);
    }
  } catch {}
  return generateLocalResponse(messages);
}

function generateLocalResponse(messages: any[]): string {
  const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
  if (lastMsg.includes('dockerfile')) {
    return `Here's a basic Dockerfile for a Node.js app:\n\n\`\`\`dockerfile\nFROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nEXPOSE 3000\nCMD ["node", "index.js"]\n\`\`\`\n\nFor a Python app:\n\`\`\`dockerfile\nFROM python:3.11-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\nCOPY . .\nEXPOSE 8000\nCMD ["uvicorn", "main:app", "--host", "0.0.0.0"]\n\`\`\``;
  }
  if (lastMsg.includes('deploy') || lastMsg.includes('build')) {
    return `For a successful deployment:\n\n1. **Check build logs** - Look for missing dependencies or env vars\n2. **Verify start command** - Ensure your \`package.json\` has a \`start\` script\n3. **Check port binding** - App must listen on \`process.env.PORT\`\n4. **Environment variables** - Set all required vars in Settings\n\nCommon fixes:\n- \`npm ci\` instead of \`npm install\` for reproducible builds\n- Add \`.npmrc\` with \`legacy-peer-deps=true\` for dependency conflicts\n- Use \`npm run build && npm start\` as the start command for compiled apps`;
  }
  if (lastMsg.includes('error') || lastMsg.includes('fail') || lastMsg.includes('log')) {
    return `To analyze deployment errors:\n\n1. Check the **Build Output** tab for the exact error message\n2. Common causes:\n   - **ENOENT**: Missing file or wrong build output directory\n   - **Cannot find module**: Missing npm package, run \`npm install\`\n   - **Permission denied**: File permission issue in the container\n   - **Port already in use**: Hard-coded port, use \`process.env.PORT\`\n3. Use the **AI Assistant** to paste your full log for detailed analysis`;
  }
  return `I'm Danny's Cloud OS AI assistant. I can help you:\n\n- 🐳 **Generate Dockerfiles** for any stack\n- 🔍 **Analyze deployment failures** and suggest fixes\n- ⚙️ **Configure build commands** for your framework\n- 🌐 **Set up domains and SSL**\n- 📊 **Optimize performance**\n\nTip: Set \`GROQ_API_KEY\` in your environment variables to unlock the full Llama 3.3 70B model for much better responses.\n\nWhat do you need help with?`;
}

router.post("/ai/chat", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { message, history = [] } = req.body;
  if (!message) { res.status(400).json({ ok: false, error: "message required" }); return; }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-6).map((m: any) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  try {
    const reply = await callGroq(messages);
    res.json({ ok: true, reply, model: GROQ_API_KEY ? GROQ_MODEL : "fallback" });
  } catch (e: any) {
    const fallback = await callFallbackLLM(messages).catch(() => generateLocalResponse(messages));
    res.json({ ok: true, reply: fallback, model: "fallback" });
  }
});

export default router;
