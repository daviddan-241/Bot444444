import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import fileUpload from "express-fileupload";
import cookieParser from "cookie-parser";
import path from "path";
import router from "./routes";
import staticServeRouter from "./routes/static-serve";
import appProxyRouter from "./routes/app-proxy";
import { logger } from "./lib/logger";
import { workerPool } from "./lib/workers";
import { dockerManager } from "./lib/docker-manager";
import { mkdir } from "fs/promises";

const app: Express = express();

// ── Ensure data dirs (persistent, platform-agnostic) ─────────────────────────
// Use CWD-relative dirs so data survives restarts on all platforms.
// Override with env vars for Docker volumes, Render disks, Railway volumes, etc.
const NEZORA_DATA_DIR = process.env.NEZORA_DATA_DIR ?? path.join(process.cwd(), ".nezora-data");
const NEZORA_APPS_DIR = process.env.NEZORA_APPS_DIR ?? path.join(process.cwd(), ".nezora-apps");
const UPLOAD_TMP_DIR = process.env.UPLOAD_TMP_DIR ?? path.join(process.cwd(), ".nezora-uploads");
Promise.all([
  mkdir(NEZORA_DATA_DIR, { recursive: true }),
  mkdir(NEZORA_APPS_DIR, { recursive: true }),
  mkdir(UPLOAD_TMP_DIR, { recursive: true }),
]).catch(() => {});

// ── HTTP logger ──────────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);

// ── CORS — allow any origin that makes sense for self-hosting ────────────────
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? null;

app.use(cors({
  credentials: true,
  origin: (origin, cb) => {
    if (!origin) { cb(null, true); return; }
    if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) { cb(null, true); return; }
    if (
      origin.endsWith(".replit.dev") || origin.endsWith(".replit.app") ||
      origin.endsWith(".repl.co") || origin.endsWith(".onrender.com") ||
      origin.includes("localhost") || origin.includes("127.0.0.1") ||
      /^https?:\/\/\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(origin)  // bare IP
    ) { cb(null, true); return; }
    // When self-hosted with a custom domain, trust all origins on same domain
    cb(null, true);
  },
}));

app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(fileUpload({
  limits: { fileSize: 500 * 1024 * 1024 },  // 500 MB for large app ZIPs
  useTempFiles: true,
  tempFileDir: UPLOAD_TMP_DIR,
}));

// ── Static site hosting at /s/:slug/* ────────────────────────────────────────
app.use(staticServeRouter);

// ── App proxy: /app/:slug/* → running process/container port ─────────────────
app.use(appProxyRouter);

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Serve built web dashboard in production (single-container mode) ───────────
// When NODE_ENV=production the Express server also serves the Vite-built
// web dashboard from ./public — enabling a single Docker container on Render.
if (process.env.NODE_ENV === "production") {
  const webDir = path.join(process.cwd(), "public");
  app.use(express.static(webDir, { maxAge: "1d", index: false }));
  // SPA fallback — anything not caught by /api, /s, /app routes → index.html
  app.use((req, res, next) => {
    if (
      req.path.startsWith("/api/") ||
      req.path.startsWith("/s/") ||
      req.path.startsWith("/app/")
    ) { next(); return; }
    res.sendFile(path.join(webDir, "index.html"), (err) => {
      if (err) next();
    });
  });
}

// ── Boot workers + Docker manager ────────────────────────────────────────────
(async () => {
  // Init Docker manager (detects if Docker is available)
  await dockerManager.init();
  // Start all background workers
  await workerPool.init();
})();

export default app;
