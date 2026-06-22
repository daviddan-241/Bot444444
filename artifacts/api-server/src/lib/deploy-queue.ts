import { EventEmitter } from "events";

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface DeployJob {
  id: string;
  name: string;
  status: JobStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  result?: any;
  error?: string;
  logs: string[];
}

class DeployQueue extends EventEmitter {
  private maxWorkers = 4;
  private running = 0;
  private pending: Array<{ job: DeployJob; fn: (log: (msg: string) => void) => Promise<any> }> = [];
  jobs = new Map<string, DeployJob>();

  enqueue(id: string, name: string, fn: (log: (msg: string) => void) => Promise<any>): DeployJob {
    const job: DeployJob = { id, name, status: "queued", createdAt: Date.now(), logs: [] };
    this.jobs.set(id, job);
    this.pending.push({ job, fn });
    this._drain();
    return job;
  }

  private _drain() {
    while (this.running < this.maxWorkers && this.pending.length > 0) {
      const item = this.pending.shift()!;
      const { job, fn } = item;
      this.running++;
      job.status = "running";
      job.startedAt = Date.now();
      const log = (msg: string) => {
        const line = `[${new Date().toISOString()}] ${msg}`;
        job.logs.push(line);
        if (job.logs.length > 1000) job.logs.shift();
        this.emit("log", { id: job.id, line });
      };
      fn(log)
        .then((result) => {
          job.status = "done";
          job.result = result;
          job.finishedAt = Date.now();
          this.emit("done", { id: job.id, result });
        })
        .catch((err) => {
          job.status = "failed";
          job.error = err instanceof Error ? err.message : String(err);
          job.finishedAt = Date.now();
          log(`FAILED: ${job.error}`);
          this.emit("failed", { id: job.id, error: job.error });
        })
        .finally(() => {
          this.running--;
          this._drain();
          setTimeout(() => this.jobs.delete(job.id), 2 * 60 * 60 * 1000);
        });
    }
  }

  get(id: string): DeployJob | undefined { return this.jobs.get(id); }
  list(): DeployJob[] { return Array.from(this.jobs.values()).sort((a, b) => b.createdAt - a.createdAt); }
  workerCount() { return { running: this.running, queued: this.pending.length, max: this.maxWorkers }; }
}

export const deployQueue = new DeployQueue();
