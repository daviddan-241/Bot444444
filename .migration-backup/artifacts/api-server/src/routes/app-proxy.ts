import { Router, type IRouter, type Request, type Response } from "express";
import http from "http";
import { processManager } from "../lib/process-manager";
import express from "express";
import path from "path";

const router: IRouter = Router();

const APPS_DIR = process.env.NEZORA_APPS_DIR ?? "/tmp/nezora-apps";

function proxyToPort(port: number, req: Request, res: Response, pathPrefix: string) {
  const targetPath = req.url.replace(new RegExp(`^${pathPrefix}`), "") || "/";
  const options: http.RequestOptions = {
    hostname: "localhost", port,
    path: targetPath, method: req.method,
    headers: { ...req.headers, host: `localhost:${port}` },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on("error", () => {
    if (!res.headersSent) res.status(502).json({ ok: false, error: "App not reachable. It may still be starting." });
  });
  if (req.method !== "GET" && req.method !== "HEAD") req.pipe(proxyReq, { end: true });
  else proxyReq.end();
}

// Dynamic app proxy: /app/:slug/* → localhost:PORT
router.all(/^\/app\/([^/]+)(\/.*)?$/, (req: Request, res: Response) => {
  const slug = (req.params as any)[0];
  const proc = processManager.get(slug);

  if (!proc) {
    // Try serving static files
    const staticDir = path.join(APPS_DIR, slug);
    return express.static(staticDir)(req, res, () => {
      res.status(404).send(`<html><body style="font-family:system-ui;background:#f5f5f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="background:white;padding:32px;border-radius:16px;text-align:center;box-shadow:0 2px 16px rgba(0,0,0,.1)"><h2 style="margin:0 0 8px;color:#1c1c1e">App Not Found</h2><p style="margin:0;color:#6c6c70">No app deployed with slug: <code>${slug}</code></p></div></body></html>`);
    });
  }

  if (proc.status !== "running") {
    return res.status(503).send(`<html><body style="font-family:system-ui;background:#f5f5f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="background:white;padding:32px;border-radius:16px;text-align:center;box-shadow:0 2px 16px rgba(0,0,0,.1)"><h2 style="margin:0 0 8px;color:#1c1c1e">${proc.name}</h2><p style="margin:0 0 4px;color:#6c6c70">Status: <strong>${proc.status}</strong></p><p style="margin:0;color:#6c6c70;font-size:13px">Check logs in Danny's Cloud OS</p></div></body></html>`);
  }

  // For static apps, serve from appDir
  if (proc.language === "html" || proc.framework === "static" || proc.framework === "vite" || proc.framework === "create-react-app") {
    const outputDir = path.join(APPS_DIR, slug, proc.framework === "vite" ? "dist" : proc.framework === "create-react-app" ? "build" : ".");
    return express.static(outputDir)(req, res, () => {
      const indexFile = path.join(outputDir, "index.html");
      res.sendFile(indexFile, (err) => {
        if (err) proxyToPort(proc.port, req, res, `/app/${slug}`);
      });
    });
  }

  proxyToPort(proc.port, req, res, `/app/${slug}`);
});

export default router;
