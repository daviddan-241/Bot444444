import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Replit-only plugins — skipped entirely in Docker / CI builds
const isReplit = !!process.env.REPL_ID;
const isDev = process.env.NODE_ENV !== "production";

// PORT and BASE_PATH are required in dev (Replit), optional in Docker build
const rawPort = process.env.PORT ?? "3000";
const port = Number(rawPort);
const basePath = process.env.BASE_PATH ?? "/";

// API server lives on 8080 by default; override with VITE_API_PORT or API_PORT
const apiPort = process.env.VITE_API_PORT ?? process.env.API_PORT ?? "8080";
const apiTarget = `http://localhost:${apiPort}`;

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    // Replit dev overlays — only load when running inside Replit dev environment
    ...(isReplit && isDev
      ? [
          (await import("@replit/vite-plugin-runtime-error-modal")).default(),
        ]
      : []),
    ...(isReplit && isDev
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      // Forward all API calls to the Express backend
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        // SSE / streaming — disable response buffering
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            const ct = proxyRes.headers["content-type"] ?? "";
            if (ct.includes("text/event-stream")) {
              proxyRes.headers["cache-control"] = "no-cache";
            }
          });
        },
      },
      // Forward deployed-app requests to the backend proxy
      "/app": {
        target: apiTarget,
        changeOrigin: true,
        ws: true,
      },
      // Forward static-site requests to the backend
      "/s": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
