import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const router: IRouter = Router();
const DATA_DIR = process.env.NEZORA_DATA_DIR || "/tmp/nezora-data";
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");

async function loadProjects(): Promise<any[]> {
  try {
    const raw = await readFile(PROJECTS_FILE, "utf8");
    return JSON.parse(raw);
  } catch { return []; }
}

async function saveProjects(projects: any[]) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(PROJECTS_FILE, JSON.stringify(projects, null, 2));
}

router.get("/projects", async (_req, res) => {
  const projects = await loadProjects();
  res.json({ projects, count: projects.length });
});

router.post("/projects", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { name, framework, description } = req.body;
  if (!name) { res.status(400).json({ ok: false, message: "name required" }); return; }
  const projects = await loadProjects();
  const project = {
    id: randomUUID(),
    name,
    framework: framework || "unknown",
    description: description || "",
    createdAt: new Date().toISOString(),
    deployments: [],
  };
  projects.unshift(project);
  await saveProjects(projects);
  res.json({ ok: true, project });
});

router.get("/projects/:id", async (req, res) => {
  const projects = await loadProjects();
  const project = projects.find(p => p.id === req.params.id);
  if (!project) { res.status(404).json({ ok: false, message: "Not found" }); return; }
  res.json({ ok: true, project });
});

router.delete("/projects/:id", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const projects = await loadProjects();
  const filtered = projects.filter(p => p.id !== req.params.id);
  await saveProjects(filtered);
  res.json({ ok: true });
});

router.post("/projects/:id/deployments", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const projects = await loadProjects();
  const project = projects.find(p => p.id === req.params.id);
  if (!project) { res.status(404).json({ ok: false, message: "Project not found" }); return; }
  const deployment = {
    id: randomUUID(),
    status: req.body.status || "pending",
    url: req.body.url || null,
    framework: req.body.framework || null,
    createdAt: new Date().toISOString(),
    logs: req.body.logs || [],
  };
  project.deployments = [deployment, ...(project.deployments || [])];
  project.framework = deployment.framework || project.framework;
  await saveProjects(projects);
  res.json({ ok: true, deployment });
});

export default router;
