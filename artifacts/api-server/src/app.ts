import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import fileUpload from "express-fileupload";
import cookieParser from "cookie-parser";
import router from "./routes";
import staticServeRouter from "./routes/static-serve";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

const replitDomain = process.env.REPLIT_DEV_DOMAIN;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? (replitDomain ? `https://${replitDomain}` : null);

app.use(cors({
  credentials: true,
  origin: (origin, cb) => {
    if (!origin) { cb(null, true); return; }
    if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) { cb(null, true); return; }
    if (
      origin.endsWith(".replit.dev") ||
      origin.endsWith(".replit.app") ||
      origin.endsWith(".repl.co")
    ) { cb(null, true); return; }
    cb(null, false);
  },
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ limits: { fileSize: 80 * 1024 * 1024 } }));

app.use(staticServeRouter);

app.use("/api", router);

export default app;
