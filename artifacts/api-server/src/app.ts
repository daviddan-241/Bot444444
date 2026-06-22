import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import fileUpload from "express-fileupload";
import cookieParser from "cookie-parser";
import router from "./routes";
import staticServeRouter from "./routes/static-serve";
import appProxyRouter from "./routes/app-proxy";
import { logger } from "./lib/logger";
import { workerPool } from "./lib/workers";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);

const replitDomain = process.env.REPLIT_DEV_DOMAIN;
const renderDomain = process.env.RENDER_EXTERNAL_URL;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN
  ?? (renderDomain ? renderDomain : replitDomain ? `https://${replitDomain}` : null);

app.use(cors({
  credentials: true,
  origin: (origin, cb) => {
    if (!origin) { cb(null, true); return; }
    if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) { cb(null, true); return; }
    if (
      origin.endsWith(".replit.dev") || origin.endsWith(".replit.app") ||
      origin.endsWith(".repl.co") || origin.endsWith(".onrender.com") ||
      origin.includes("localhost") || origin.includes("127.0.0.1")
    ) { cb(null, true); return; }
    cb(null, false);
  },
}));

app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(fileUpload({ limits: { fileSize: 200 * 1024 * 1024 }, useTempFiles: true, tempFileDir: "/tmp/cloudos-uploads/" }));

// Static site hosting at /s/:slug/*
app.use(staticServeRouter);

// App proxy: /app/:slug/* → running process port
app.use(appProxyRouter);

// API routes
app.use("/api", router);

// Start all background workers
workerPool.init();

export default app;
