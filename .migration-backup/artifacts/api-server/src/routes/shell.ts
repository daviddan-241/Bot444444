import { Router, type IRouter } from "express";
import { execFile } from "child_process";
import { assertAdmin } from "../lib/auth-guard";

const router: IRouter = Router();

const presets: Record<string, { cmd: string; args: string[]; label: string }> = {
  info: { cmd: "sh", args: ["-lc", "uname -a; printf \"\\n--- release ---\\n\"; cat /etc/os-release 2>/dev/null || true; printf \"\\n--- node ---\\n\"; node -v; npm -v; printf \"\\n--- disk ---\\n\"; df -h .; printf \"\\n--- memory ---\\n\"; free -m 2>/dev/null || true"], label: "System info" },
  files: { cmd: "sh", args: ["-lc", 'pwd; find . -maxdepth 2 -type f | sed "s#^./##" | sort | head -200'], label: "List files" },
  doctor: { cmd: "sh", args: ["-lc", "node --version && npm --version"], label: "Run doctor check" },
  build: { cmd: "npm", args: ["run", "build"], label: "Production build" },
  audit: { cmd: "npm", args: ["audit", "--omit=dev"], label: "Dependency audit" },
  repair: { cmd: "sh", args: ["-lc", "npm install"], label: "Repair dependencies" },
  envsafe: { cmd: "sh", args: ["-lc", 'env | cut -d= -f1 | sort | sed "s/$/=***/"'], label: "Environment keys only" },
  processes: { cmd: "sh", args: ["-lc", "ps aux | head -80"], label: "Process list" },
  network: { cmd: "sh", args: ["-lc", "hostname; getent hosts github.com render.com 2>/dev/null || true; curl -I --max-time 10 https://github.com 2>/dev/null | head || true"], label: "Network check" },
  ports: { cmd: "sh", args: ["-lc", "ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null || true"], label: "Open ports" },
  git: { cmd: "sh", args: ["-lc", 'git status --short 2>/dev/null || true; git remote -v 2>/dev/null | sed "s#https://.*@#https://***@#" || true; git branch --show-current 2>/dev/null || true'], label: "Git status" },
};

function run(cmd: string, args: string[], timeout = 120000) {
  return new Promise<{ code: number; stdout: string; stderr: string; command: string }>((resolve) => {
    execFile(cmd, args, { cwd: process.cwd(), timeout, maxBuffer: 1024 * 1024 * 4 }, (error, stdout, stderr) => {
      resolve({ code: typeof (error as any)?.code === "number" ? (error as any).code : 0, stdout, stderr, command: [cmd, ...args].join(" ") });
    });
  });
}

router.post("/system/shell", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const body = req.body;
  const preset = typeof body.preset === "string" ? presets[body.preset] : undefined;
  if (preset) {
    res.json({ ok: true, result: await run(preset.cmd, preset.args) });
    return;
  }
  if (process.env.ALLOW_SHELL !== "true") {
    res.status(403).json({ ok: false, message: "Custom shell disabled. Set ALLOW_SHELL=true for your private instance." });
    return;
  }
  const command = String(body.command || "").trim();
  if (!command) { res.status(400).json({ ok: false, message: "Missing command." }); return; }
  res.json({ ok: true, result: await run("sh", ["-lc", command], 180000) });
});

export default router;
