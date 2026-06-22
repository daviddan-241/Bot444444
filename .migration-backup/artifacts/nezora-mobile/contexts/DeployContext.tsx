import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface DeployJob {
  id: string;
  name: string;
  mode: "git" | "docker";
  status: "deploying" | "success" | "failed";
  url?: string;
  error?: string;
  logs?: string[];
  startedAt: number;
  finishedAt?: number;
}

const JOBS_KEY = "cloudos_deploy_jobs";
const MAX_JOBS = 20;

interface DeployContextType {
  jobs: DeployJob[];
  activeCount: number;
  addJob: (job: Omit<DeployJob, "startedAt">) => Promise<void>;
  updateJob: (id: string, patch: Partial<DeployJob>) => Promise<void>;
  clearFinished: () => Promise<void>;
}

const DeployContext = createContext<DeployContextType>({
  jobs: [],
  activeCount: 0,
  addJob: async () => {},
  updateJob: async () => {},
  clearFinished: async () => {},
});

export function DeployProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<DeployJob[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(JOBS_KEY);
        if (raw) {
          const parsed: DeployJob[] = JSON.parse(raw);
          // Mark any stale "deploying" jobs (older than 10 min) as failed
          const now = Date.now();
          const fixed = parsed.map(j =>
            j.status === "deploying" && now - j.startedAt > 10 * 60 * 1000
              ? { ...j, status: "failed" as const, error: "Timed out", finishedAt: now }
              : j
          );
          setJobs(fixed);
        }
      } catch {}
    })();
  }, []);

  const persist = useCallback(async (updated: DeployJob[]) => {
    const trimmed = updated.slice(-MAX_JOBS);
    setJobs(trimmed);
    try { await AsyncStorage.setItem(JOBS_KEY, JSON.stringify(trimmed)); } catch {}
  }, []);

  const addJob = useCallback(async (job: Omit<DeployJob, "startedAt">) => {
    const full: DeployJob = { ...job, startedAt: Date.now() };
    setJobs(prev => {
      const next = [...prev, full].slice(-MAX_JOBS);
      AsyncStorage.setItem(JOBS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const updateJob = useCallback(async (id: string, patch: Partial<DeployJob>) => {
    setJobs(prev => {
      const next = prev.map(j => j.id === id ? { ...j, ...patch } : j);
      AsyncStorage.setItem(JOBS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearFinished = useCallback(async () => {
    const next = jobs.filter(j => j.status === "deploying");
    await persist(next);
  }, [jobs, persist]);

  return (
    <DeployContext.Provider value={{
      jobs,
      activeCount: jobs.filter(j => j.status === "deploying").length,
      addJob,
      updateJob,
      clearFinished,
    }}>
      {children}
    </DeployContext.Provider>
  );
}

export function useDeploy() {
  return useContext(DeployContext);
}
