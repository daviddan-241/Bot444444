import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";
import { loadCatalog, saveCatalog, APP_ROOT } from "./app-deploy";
import { LOCAL_SITE_ROOT } from "./static-serve";
import { processManager } from "../lib/process-manager";
import { getPublicUrl } from "../lib/platform";
import { readdir, stat, rm, readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

const router: IRouter = Router();

const SITES_CATALOG = path.join(LOCAL_SITE_ROOT, ".sites-catalog.json");

export interface SiteCatalogEntry {
  slug: string;
  name: string;
  url: string;
  framework: string;
  type: "static" | "live-app";
  source?: "zip" | "git";
  gitUrl?: string;
  branch?: string;
  createdAt: number;
  updatedAt?: number;
  size?: number;
}

export async function loadSitesCatalog(): Promise<Record<string, SiteCatalogEntry>> {
  try { return JSON.parse(await readFile(SITES_CATALOG, "utf8")); } catch { return {}; }
}

export async function saveSitesCatalog(cat: Record<string, SiteCatalogEntry>) {
  await mkdir(LOCAL_SITE_ROOT, { recursive: true });
  await writeFile(SITES_CATALOG, JSON.stringify(cat, null, 2));
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) total += await dirSize(full);
      else total += (await stat(full)).size;
    }
  } catch {}
  return total;
}

// GET /api/real/sites — list all static sites + live apps
router.get("/real/sites", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const origin = getPublicUrl(req);
  const out: SiteCatalogEntry[] = [];

  // --- Static sites from .nezora-sites ---
  const sitesCat = await loadSitesCatalog();
  try {
    const entries = await readdir(LOCAL_SITE_ROOT, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      const slug = e.name;
      const existing = sitesCat[slug];
      const siteDir = path.join(LOCAL_SITE_ROOT, slug);
      const s = await stat(siteDir).catch(() => null);
      const createdAt = existing?.createdAt ?? s?.birthtimeMs ?? s?.mtimeMs ?? Date.now();
      out.push({
        slug,
        name: existing?.name ?? slug,
        url: existing?.url ?? `${origin}/api/s/${slug}/`,
        framework: existing?.framework ?? "static",
        type: "static",
        source: existing?.source,
        gitUrl: existing?.gitUrl,
        branch: existing?.branch,
        createdAt,
        updatedAt: existing?.updatedAt ?? s?.mtimeMs,
        size: await dirSize(siteDir),
      });
    }
  } catch {}

  // --- Live apps from app catalog ---
  const appCat = await loadCatalog();
  for (const entry of Object.values(appCat)) {
    const proc = processManager.get(entry.id);
    out.push({
      slug: entry.id,
      name: entry.name,
      url: proc?.url ?? `${origin}/app/${entry.id}/`,
      framework: entry.framework,
      type: "live-app",
      source: undefined,
      createdAt: entry.createdAt,
    });
  }

  // Sort newest first
  out.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ ok: true, sites: out, total: out.length });
});

// GET /api/real/sites/:slug — single site info
router.get("/real/sites/:slug", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { slug } = req.params;
  const origin = getPublicUrl(req);

  const sitesCat = await loadSitesCatalog();
  const siteDir = path.join(LOCAL_SITE_ROOT, slug);
  const appCat = await loadCatalog();

  if (sitesCat[slug]) {
    const s = await stat(siteDir).catch(() => null);
    res.json({ ok: true, site: { ...sitesCat[slug], size: await dirSize(siteDir), exists: !!s } });
    return;
  }
  if (appCat[slug]) {
    const proc = processManager.get(slug);
    res.json({ ok: true, site: { ...appCat[slug], type: "live-app", url: proc?.url ?? `${origin}/app/${slug}/`, status: proc?.status } });
    return;
  }
  res.status(404).json({ ok: false, message: "Site not found" });
});

// DELETE /api/real/sites/:slug — delete static site or stop & remove live app
router.delete("/real/sites/:slug", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { slug } = req.params;

  // Try static site first
  const siteDir = path.join(LOCAL_SITE_ROOT, slug);
  const isStatic = await stat(siteDir).then(s => s.isDirectory()).catch(() => false);
  if (isStatic) {
    await rm(siteDir, { recursive: true, force: true });
    const cat = await loadSitesCatalog();
    delete cat[slug];
    await saveSitesCatalog(cat);
    res.json({ ok: true, message: `Static site '${slug}' deleted.` });
    return;
  }

  // Try live app
  const appCat = await loadCatalog();
  if (appCat[slug]) {
    try { await processManager.kill(slug); } catch {}
    const appDir = path.join(APP_ROOT, slug);
    await rm(appDir, { recursive: true, force: true }).catch(() => {});
    delete appCat[slug];
    await saveCatalog(appCat);
    res.json({ ok: true, message: `Live app '${slug}' stopped and removed.` });
    return;
  }

  res.status(404).json({ ok: false, message: "Site not found" });
});

// PUT /api/real/sites/:slug — register/update site metadata (called after deploy)
router.put("/real/sites/:slug", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { slug } = req.params;
  const body = req.body as Partial<SiteCatalogEntry>;
  const cat = await loadSitesCatalog();
  cat[slug] = { ...(cat[slug] ?? {}), ...body, slug, updatedAt: Date.now() } as SiteCatalogEntry;
  await saveSitesCatalog(cat);
  res.json({ ok: true, site: cat[slug] });
});

export default router;
