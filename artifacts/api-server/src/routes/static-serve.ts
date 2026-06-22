import { Router, type IRouter } from "express";
import { readFile, stat } from "fs/promises";
import path from "path";

const router: IRouter = Router();

export const LOCAL_SITE_ROOT =
  process.env.NEZORA_LOCAL_SITE_ROOT ||
  path.join(process.cwd(), ".nezora-sites");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function fileExists(file: string) {
  try { return (await stat(file)).isFile(); } catch { return false; }
}

router.get("/api/s/:slug{/*path}", async (req, res) => {
  const slug = (req.params.slug || "").replace(/[^a-z0-9-]/g, "");
  const rest = (req.params as any).path || "index.html";
  const root = path.resolve(LOCAL_SITE_ROOT, slug);
  let file = path.resolve(root, rest);
  if (!file.startsWith(root)) { res.status(403).send("Blocked"); return; }
  if (!(await fileExists(file))) file = path.join(root, "index.html");
  if (!(await fileExists(file))) {
    res.status(404).send("Site not found. It may have been redeployed or this link is wrong. Go back to Nezora and redeploy.");
    return;
  }
  const body = await readFile(file);
  res.setHeader("content-type", TYPES[path.extname(file).toLowerCase()] || "application/octet-stream");
  res.setHeader("cache-control", "public, max-age=300");
  res.send(body);
});

export default router;
