import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";
import { execFile } from "child_process";
import { promisify } from "util";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);

async function run(cmd: string, args: string[], cwd: string): Promise<{ ok: boolean; out: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd, timeout: 60000 });
    return { ok: true, out: (stdout + stderr).trim() };
  } catch (e: any) {
    return { ok: false, out: e.message ?? String(e) };
  }
}

router.post("/github/push", async (req, res) => {
  if (!assertAdmin(req, res)) return;

  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    res.status(400).json({ ok: false, error: "GITHUB_PERSONAL_ACCESS_TOKEN not configured" });
    return;
  }

  const repo = (req.body?.repo as string) || "daviddan-241/Bot444444";
  const remote = `https://${token}@github.com/${repo}.git`;
  const cwd = process.cwd();
  const logs: string[] = [];

  // Check if git is initialized
  const gitCheck = await run("git", ["rev-parse", "--git-dir"], cwd);
  if (!gitCheck.ok) {
    const init = await run("git", ["init"], cwd);
    logs.push(init.ok ? "✓ Git initialized" : `✗ Git init: ${init.out}`);
  }

  // Configure git user
  await run("git", ["config", "user.email", "cloud@dannys.app"], cwd);
  await run("git", ["config", "user.name", "Danny's Cloud"], cwd);

  // Set/update remote
  const remoteCheck = await run("git", ["remote", "get-url", "origin"], cwd);
  if (!remoteCheck.ok) {
    await run("git", ["remote", "add", "origin", remote], cwd);
    logs.push("✓ Remote added");
  } else {
    await run("git", ["remote", "set-url", "origin", remote], cwd);
    logs.push("✓ Remote updated");
  }

  // Stage all files
  const add = await run("git", ["add", "-A"], cwd);
  logs.push(add.ok ? "✓ Files staged" : `✗ Stage: ${add.out}`);

  // Commit
  const commit = await run("git", ["commit", "-m", `chore: deploy update ${new Date().toISOString()}`], cwd);
  if (commit.ok) {
    logs.push("✓ Committed");
  } else if (commit.out.includes("nothing to commit")) {
    logs.push("✓ Nothing new to commit");
  } else {
    logs.push(`Note: ${commit.out.split("\n")[0]}`);
  }

  // Push to main
  const push = await run("git", ["push", "-u", "origin", "HEAD:main", "--force"], cwd);
  if (push.ok) {
    logs.push(`✓ Pushed to github.com/${repo}`);
    logs.push("→ Render will auto-deploy in ~30 seconds");
    res.json({ ok: true, logs });
  } else {
    logs.push(`✗ Push failed: ${push.out}`);
    res.json({ ok: false, error: "Push failed", logs });
  }
});

export default router;
