import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/providers", (_req, res) => {
  const connections = [
    { key: "cloudflare-pages", label: "Cloudflare Pages", connected: true, status: "healthy", limitText: "Free Pages + SSL healthy" },
    { key: "vercel", label: "Vercel Hobby", connected: true, status: "healthy", limitText: "Personal projects ready" },
    { key: "koyeb", label: "Koyeb Nano", connected: false, status: "disconnected", limitText: "API key required" },
    { key: "zeabur", label: "Zeabur", connected: false, status: "disconnected", limitText: "API key required" },
    { key: "northflank", label: "Northflank Sandbox", connected: false, status: "disconnected", limitText: "API key required" },
    { key: "bot-host", label: "Free Bot Host", connected: false, status: "warning", limitText: "Manual host policy review" },
  ];
  res.json({ connections });
});

export default router;
