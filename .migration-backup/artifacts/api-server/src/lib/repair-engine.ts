import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile } from "fs/promises";
import path from "path";
import { processManager } from "./process-manager";

const exec = promisify(execFile);

export interface RepairAction {
  type: "install-deps" | "fix-port" | "fix-start-cmd" | "regenerate-dockerfile" | "clear-cache" | "manual";
  description: string;
  command?: string;
  auto: boolean;
}

export interface RepairResult {
  success: boolean;
  actionsAttempted: RepairAction[];
  log: string[];
  suggestion?: string;
}

const KNOWN_ERRORS: Array<{ pattern: RegExp; action: RepairAction; fix?: (dir: string, logs: string) => Promise<void> }> = [
  {
    pattern: /cannot find module|module not found/i,
    action: { type: "install-deps", description: "Missing dependencies — reinstall node_modules", command: "npm install --production=false", auto: true },
    fix: async (dir) => { await exec("npm", ["install", "--production=false"], { cwd: dir }); }
  },
  {
    pattern: /enoent.*package\.json/i,
    action: { type: "fix-start-cmd", description: "package.json not found in expected location", auto: false },
  },
  {
    pattern: /address already in use|eaddrinuse/i,
    action: { type: "fix-port", description: "Port conflict — reassigning port", auto: true },
  },
  {
    pattern: /pip.*not found|no module named/i,
    action: { type: "install-deps", description: "Missing Python packages — reinstall requirements", command: "pip install -r requirements.txt", auto: true },
    fix: async (dir) => { await exec("pip", ["install", "-r", "requirements.txt"], { cwd: dir }); }
  },
  {
    pattern: /syntaxerror|unexpected token/i,
    action: { type: "manual", description: "Syntax error in source code — requires manual fix", auto: false },
  },
  {
    pattern: /out of memory|javascript heap out of memory/i,
    action: { type: "fix-start-cmd", description: "OOM — adding --max-old-space-size flag", command: "node --max-old-space-size=512 index.js", auto: true },
  },
  {
    pattern: /permission denied/i,
    action: { type: "fix-start-cmd", description: "Permission denied — adding chmod", command: "chmod +x *.sh && npm start", auto: true },
  },
  {
    pattern: /npm warn|npm err/i,
    action: { type: "install-deps", description: "npm warnings/errors — clean reinstall", command: "rm -rf node_modules && npm install", auto: true },
    fix: async (dir) => {
      await exec("rm", ["-rf", "node_modules"], { cwd: dir });
      await exec("npm", ["install", "--production=false"], { cwd: dir });
    }
  },
];

export async function analyzeAndRepair(projectId: string, projectDir: string): Promise<RepairResult> {
  const logs = processManager.getLogs(projectId, 200).join("\n");
  const result: RepairResult = { success: false, actionsAttempted: [], log: [] };

  const matched: typeof KNOWN_ERRORS = [];
  for (const rule of KNOWN_ERRORS) {
    if (rule.pattern.test(logs)) matched.push(rule);
  }

  if (matched.length === 0) {
    result.log.push("No known error patterns found in logs.");
    result.suggestion = "Review logs manually. The error may be application-specific.";
    return result;
  }

  for (const rule of matched) {
    result.actionsAttempted.push(rule.action);
    result.log.push(`[REPAIR] Detected: ${rule.action.description}`);

    if (rule.action.auto && rule.fix) {
      try {
        await rule.fix(projectDir, logs);
        result.log.push(`[REPAIR] Applied fix: ${rule.action.command ?? rule.action.description}`);
        result.success = true;
      } catch (e) {
        result.log.push(`[REPAIR] Fix failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (!rule.action.auto) {
      result.log.push(`[REPAIR] Manual action required: ${rule.action.description}`);
      result.suggestion = rule.action.description;
    }
  }

  if (result.success) {
    result.log.push("[REPAIR] Restarting process after repair...");
    await processManager.restart(projectId);
  }

  return result;
}

export function buildRepairSuggestion(logs: string): string {
  const lower = logs.toLowerCase();
  if (lower.includes("cannot find module")) return "Run `npm install` to restore missing packages.";
  if (lower.includes("eaddrinuse")) return "Port conflict — restart the app or change PORT env var.";
  if (lower.includes("out of memory")) return "Increase memory limit: set NODE_OPTIONS=--max-old-space-size=512";
  if (lower.includes("syntaxerror")) return "Fix the syntax error in the source file indicated in the logs.";
  if (lower.includes("no module named")) return "Run `pip install -r requirements.txt` to restore packages.";
  if (lower.includes("permission denied")) return "Run `chmod +x` on the entry script.";
  return "Review the error logs carefully. If unclear, use the AI Assistant to analyze.";
}
