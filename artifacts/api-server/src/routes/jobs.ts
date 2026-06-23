import { Router, type Request, type Response } from "express";
import type { UploadedFile } from "express-fileupload";
import { mkdtemp, rm, mkdir, readdir } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import AdmZip from "adm-zip";
import { assertAdmin } from "../lib/auth-guard";
import { deployQueue } from "../lib/deploy-queue";

const router = Router();

// ── List all jobs ─────────────────────────────────────────────────────────────
router.get("/jobs", (_req: Request, res: Response) => {
  res.json({ ok: true, jobs: deployQueue.list(), workers: deployQueue.workerCount() });
});

// ── Get single job ────────────────────────────────────────────────────────────
router.get("/jobs/:id", (req: Request, res: Response) => {
  const job = deployQueue.get(String(req.params.id));
  if (!job) { res.status(404).json({ ok: false, error: "Job not found" }); return; }
  res.json({ ok: true, job });
});

// ── SSE stream for a job ──────────────────────────────────────────────────────
router.get("/jobs/:id/stream", (req: Request, res: Response) => {
  const job = deployQueue.get(String(req.params.id));
  if (!job) { res.status(404).json({ ok: false, error: "Job not found" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders?.();

  const send = (payload: object) => {
    try { res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch {}
  };

  // Send all buffered logs so far
  for (const line of job.logs) send({ line });

  // Already finished
  if (job.status === "done" || job.status === "failed") {
    send({ done: true, status: job.status, result: job.result, error: job.error });
    res.end();
    return;
  }

  const onLog = ({ id, line }: { id: string; line: string }) => {
    if (id === req.params.id) send({ line });
  };
  const onDone = ({ id, result }: { id: string; result: any }) => {
    if (id !== req.params.id) return;
    send({ done: true, status: "done", result });
    cleanup(); res.end();
  };
  const onFailed = ({ id, error }: { id: string; error: string }) => {
    if (id !== req.params.id) return;
    send({ done: true, status: "failed", error });
    cleanup(); res.end();
  };

  const cleanup = () => {
    deployQueue.off("log", onLog);
    deployQueue.off("done", onDone);
    deployQueue.off("failed", onFailed);
  };

  deployQueue.on("log", onLog);
  deployQueue.on("done", onDone);
  deployQueue.on("failed", onFailed);
  req.on("close", cleanup);
});

// ── Enqueue Git deploy job (returns immediately with jobId) ───────────────────
router.post("/jobs/git", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const body = req.body as {
    url: string | string[]; branch?: string | string[]; name?: string | string[];
    mode?: string; memLimit?: string; cpuLimit?: string; restartPolicy?: string;
  };
  const repoUrl = Array.isArray(body.url) ? body.url[0] : body.url;
  const branch = Array.isArray(body.branch) ? body.branch[0] : (body.branch ?? "main");
  const appName = Array.isArray(body.name) ? body.name[0] : body.name;
  const mode = body.mode as "process" | "docker" | undefined;
  const memLimit = body.memLimit; const cpuLimit = body.cpuLimit; const restartPolicy = body.restartPolicy;
  if (!repoUrl) { res.status(400).json({ ok: false, error: "url required" }); return; }

  const name = appName || repoUrl.split("/").pop()?.replace(/\.git$/, "") || "app";
  const jobId = `j-${Date.now().toString(36)}`;

  const job = deployQueue.enqueue(jobId, name, async (log) => {
    const work = await mkdtemp(path.join(tmpdir(), "cloudos-jgit-"));
    try {
      log(`🔍 Detected project: ${name}`);
      log(`📦 Cloning ${repoUrl} (branch: ${branch})…`);

      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execP = promisify(execFile);

      const ghToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      const cloneUrl = ghToken && repoUrl.includes("github.com")
        ? repoUrl.replace("https://", `https://${ghToken}@`)
        : repoUrl;

      const run = (cmd: string, args: string[], cwd: string) =>
        new Promise<{ code: number; output: string }>(resolve => {
          const proc = execFile(cmd, args, { cwd, maxBuffer: 50 * 1024 * 1024 } as any,
            (err, stdout, stderr) => resolve({ code: err ? (err as any).code ?? 1 : 0, output: [stdout, stderr].filter(Boolean).join("\n") }));
          proc.stdout?.on("data", (d: Buffer) => log(d.toString().replace(/\n$/, "")));
          proc.stderr?.on("data", (d: Buffer) => log(d.toString().replace(/\n$/, "")));
        });

      let r = await run("git", ["clone", "--depth=1", "--branch", branch, cloneUrl, "repo"], work);
      if (r.code !== 0) {
        r = await run("git", ["clone", "--depth=1", cloneUrl, "repo"], work);
        if (r.code !== 0) throw new Error(`git clone failed — check repo URL and token`);
      }

      log("✅ Clone complete. Detecting stack…");

      // Import and call deployFromDir
      const { deployFromDir } = await import("./deploy-engine");
      const reqLike = req; // pass original req for URL building
      const result = await deployFromDir(
        path.join(work, "repo"),
        reqLike as any,
        name,
        `git:${repoUrl}`,
        { mode, memLimit, cpuLimit, restartPolicy, externalLog: log },
      );

      if (!result.ok) {
        // Auto-repair attempt
        log("🔧 Auto-repair: analyzing error…");
        try {
          const { analyzeAndRepair } = await import("../lib/repair-engine");
          const repair = await analyzeAndRepair(jobId, path.join(work, "repo"));
          if (repair.success) {
            log("✅ Auto-repair succeeded — retrying deploy");
            const retry = await deployFromDir(
              path.join(work, "repo"),
              reqLike as any,
              name,
              `git:${repoUrl}`,
              { mode, memLimit, cpuLimit, restartPolicy, externalLog: log },
            );
            if (retry.ok) return retry;
            log("⚠️ Retry after repair also failed");
          } else {
            for (const action of repair.actionsAttempted) log(`  └─ ${action.description}`);
            if (repair.suggestion) log(`💡 Suggestion: ${repair.suggestion}`);
          }
        } catch (repairErr) {
          log(`⚠️ Auto-repair error: ${repairErr}`);
        }
        throw new Error(result.error ?? "Deploy failed");
      }

      log(`🚀 Live at: ${result.url}`);
      return result;
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  res.json({ ok: true, jobId: job.id, name: job.name, status: job.status });
});

// ── Enqueue ZIP deploy job ────────────────────────────────────────────────────
router.post("/jobs/zip", async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;
  const file = req.files?.file as UploadedFile | undefined;
  if (!file) { res.status(400).json({ ok: false, error: "No file uploaded" }); return; }

  const name = (req.body.name as string) || file.name.replace(/\.zip$/i, "") || "app";
  const mode = (req.body.mode as "process" | "docker") || undefined;
  const jobId = `j-${Date.now().toString(36)}`;

  // Move file to a stable temp path before the request context is gone
  const stableDir = await mkdtemp(path.join(tmpdir(), "cloudos-jzip-"));
  const zipPath = path.join(stableDir, "upload.zip");
  await file.mv(zipPath);

  const job = deployQueue.enqueue(jobId, name, async (log) => {
    try {
      log(`📦 Processing ZIP: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      const zip = new AdmZip(zipPath);
      const extract = path.join(stableDir, "src");
      await mkdir(extract, { recursive: true });
      zip.extractAllTo(extract, true);
      const entries = await readdir(extract);
      const srcDir = entries.length === 1 ? path.join(extract, entries[0]) : extract;
      log(`✅ Extracted ${entries.length} top-level items. Detecting stack…`);

      const { deployFromDir } = await import("./deploy-engine");
      const result = await deployFromDir(srcDir, req as any, name, "zip", { mode, externalLog: log });

      if (!result.ok) {
        log("🔧 Auto-repair: analyzing error…");
        try {
          const { analyzeAndRepair } = await import("../lib/repair-engine");
          const repair = await analyzeAndRepair(jobId, srcDir);
          if (repair.success) {
            log("✅ Auto-repair succeeded — retrying deploy");
            const retry = await deployFromDir(srcDir, req as any, name, "zip", { mode, externalLog: log });
            if (retry.ok) return retry;
          } else {
            for (const a of repair.actionsAttempted) log(`  └─ ${a.description}`);
            if (repair.suggestion) log(`💡 Suggestion: ${repair.suggestion}`);
          }
        } catch {}
        throw new Error(result.error ?? "Deploy failed");
      }

      log(`🚀 Live at: ${result.url}`);
      return result;
    } finally {
      await rm(stableDir, { recursive: true, force: true });
    }
  });

  res.json({ ok: true, jobId: job.id, name: job.name, status: job.status });
});

export default router;
