import { readdir, readFile, access } from "fs/promises";
import path from "path";

export interface StackInfo {
  language: string;
  framework: string;
  runtime: string;
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
  installCmd: string;
  buildCmd: string | null;
  startCmd: string;
  port: number;
  outputDir: string | null;
  dockerfile: boolean;
  detected: string[];
}

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function readJson(p: string): Promise<any> {
  try { return JSON.parse(await readFile(p, "utf8")); } catch { return null; }
}

export function detectPackageManager(files: string[]): "npm" | "pnpm" | "yarn" | "bun" {
  if (files.includes("pnpm-lock.yaml") || files.includes("pnpm-workspace.yaml")) return "pnpm";
  if (files.includes("bun.lockb") || files.includes("bun.lock")) return "bun";
  if (files.includes("yarn.lock")) return "yarn";
  return "npm";
}

function pmCmd(pm: "npm" | "pnpm" | "yarn" | "bun", action: "install" | "run", script?: string): string {
  switch (pm) {
    case "pnpm":
      return action === "install" ? "pnpm install --no-frozen-lockfile" : `pnpm run ${script}`;
    case "yarn":
      return action === "install" ? "yarn install --non-interactive" : `yarn run ${script}`;
    case "bun":
      return action === "install" ? "bun install" : `bun run ${script}`;
    default:
      return action === "install" ? "npm install --production=false --legacy-peer-deps" : `npm run ${script}`;
  }
}

export async function detectStack(dir: string): Promise<StackInfo> {
  const files = await readdir(dir).catch(() => [] as string[]);
  const has = (f: string) => files.includes(f);
  const detected: string[] = [];

  // Dockerfile
  if (has("Dockerfile") || has("dockerfile")) {
    detected.push("Dockerfile");
    return { language: "docker", framework: "docker", runtime: "docker", packageManager: "npm", installCmd: "", buildCmd: "docker build -t app .", startCmd: "docker run -p $PORT:$PORT app", port: 3000, outputDir: null, dockerfile: true, detected };
  }

  // Node.js
  if (has("package.json")) {
    detected.push("package.json");
    const pkg = await readJson(path.join(dir, "package.json"));
    const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
    const scripts = pkg?.scripts ?? {};
    const pm = detectPackageManager(files);
    detected.push(`package-manager:${pm}`);

    let framework = "node";
    let buildCmd: string | null = null;
    let outputDir: string | null = null;
    let port = 3000;
    let startCmd = scripts.start ? `${pm === "npm" ? "npm" : pm} start` : scripts.serve ? `${pm === "npm" ? "npm" : pm} run serve` : "node index.js";

    if (deps["next"] !== undefined) {
      framework = "nextjs"; buildCmd = pmCmd(pm, "run", "build"); startCmd = pmCmd(pm, "run", "start"); outputDir = ".next"; port = 3000; detected.push("Next.js");
    } else if (deps["react-scripts"] !== undefined || deps["vite"] !== undefined) {
      framework = deps["vite"] ? "vite" : "create-react-app";
      buildCmd = pmCmd(pm, "run", "build"); outputDir = deps["vite"] ? "dist" : "build"; port = 3000;
      startCmd = `npx serve -s ${outputDir} -l $PORT`; detected.push(framework);
    } else if (deps["nuxt"] !== undefined || deps["nuxt3"] !== undefined) {
      framework = "nuxt"; buildCmd = pmCmd(pm, "run", "build"); startCmd = pmCmd(pm, "run", "start"); port = 3000; detected.push("Nuxt");
    } else if (deps["@sveltejs/kit"] !== undefined || deps["svelte"] !== undefined) {
      framework = "svelte"; buildCmd = pmCmd(pm, "run", "build"); outputDir = "build"; startCmd = `npx serve -s build -l $PORT`; port = 3000; detected.push("Svelte");
    } else if (deps["express"] !== undefined) {
      framework = "express"; startCmd = scripts.start ? pmCmd(pm, "run", "start") : "node index.js"; port = 3000; detected.push("Express");
    } else if (deps["fastify"] !== undefined) {
      framework = "fastify"; startCmd = scripts.start ? pmCmd(pm, "run", "start") : "node index.js"; port = 3000; detected.push("Fastify");
    } else if (deps["@nestjs/core"] !== undefined) {
      framework = "nestjs"; buildCmd = pmCmd(pm, "run", "build"); startCmd = pmCmd(pm, "run", "start:prod"); port = 3000; detected.push("NestJS");
    } else if (deps["discord.js"] !== undefined || deps["discord-js"] !== undefined || deps["@discordjs/rest"] !== undefined) {
      framework = "discord-bot"; startCmd = scripts.start ? pmCmd(pm, "run", "start") : "node index.js"; port = 0; detected.push("Discord.js bot");
    } else if (deps["telegraf"] !== undefined || deps["node-telegram-bot-api"] !== undefined || deps["grammy"] !== undefined) {
      framework = "telegram-bot"; startCmd = scripts.start ? pmCmd(pm, "run", "start") : "node index.js"; port = 0; detected.push("Telegram bot");
    } else {
      framework = "node"; startCmd = scripts.start ? pmCmd(pm, "run", "start") : "node index.js"; port = 3000;
    }

    const hasBuild = scripts.build !== undefined;
    const installCmd = pmCmd(pm, "install");
    return { language: "javascript", framework, runtime: "node", packageManager: pm, installCmd, buildCmd: hasBuild ? pmCmd(pm, "run", "build") : buildCmd, startCmd, port, outputDir, dockerfile: false, detected };
  }

  // Python
  if (has("requirements.txt") || has("pyproject.toml") || has("setup.py") || has("Pipfile")) {
    detected.push("Python project");
    const req = has("requirements.txt") ? await readFile(path.join(dir, "requirements.txt"), "utf8").catch(() => "") : "";
    let framework = "python";
    let startCmd = "python app.py";
    let port = 8000;
    let installCmd = "pip install -r requirements.txt --no-cache-dir";
    if (!has("requirements.txt")) installCmd = "pip install -e . || true";

    if (req.includes("fastapi") || req.includes("uvicorn")) {
      framework = "fastapi"; startCmd = "uvicorn app:app --host 0.0.0.0 --port $PORT"; port = 8000; detected.push("FastAPI");
    } else if (req.includes("flask")) {
      framework = "flask"; startCmd = "python app.py"; port = 5000; detected.push("Flask");
    } else if (req.includes("django")) {
      framework = "django"; startCmd = "python manage.py runserver 0.0.0.0:$PORT"; port = 8000; detected.push("Django");
    } else if (req.includes("streamlit")) {
      framework = "streamlit"; startCmd = "streamlit run app.py --server.port=$PORT --server.address=0.0.0.0"; port = 8501; detected.push("Streamlit");
    } else if (has("bot.py") || has("main.py")) {
      startCmd = has("main.py") ? "python main.py" : "python bot.py"; framework = "python-script"; detected.push("Python script");
    }

    return { language: "python", framework, runtime: "python3", packageManager: "npm", installCmd, buildCmd: null, startCmd, port, outputDir: null, dockerfile: false, detected };
  }

  // PHP
  if (has("index.php") || has("composer.json")) {
    detected.push("PHP");
    const installCmd = has("composer.json") ? "composer install --no-dev" : "";
    return { language: "php", framework: "php", runtime: "php", packageManager: "npm", installCmd, buildCmd: null, startCmd: "php -S 0.0.0.0:$PORT", port: 8080, outputDir: null, dockerfile: false, detected };
  }

  // Static HTML
  if (has("index.html") || has("index.htm")) {
    detected.push("Static HTML");
    return { language: "html", framework: "static", runtime: "node", packageManager: "npm", installCmd: "", buildCmd: null, startCmd: `npx serve -s . -l $PORT`, port: 3000, outputDir: null, dockerfile: false, detected };
  }

  // Deno
  if (has("deno.json") || has("deno.jsonc") || has("deps.ts")) {
    detected.push("Deno");
    return { language: "typescript", framework: "deno", runtime: "deno", packageManager: "npm", installCmd: "", buildCmd: null, startCmd: "deno run --allow-all main.ts", port: 8000, outputDir: null, dockerfile: false, detected };
  }

  // Rust
  if (has("Cargo.toml")) {
    detected.push("Rust");
    return { language: "rust", framework: "rust", runtime: "cargo", packageManager: "npm", installCmd: "", buildCmd: "cargo build --release", startCmd: "./target/release/app", port: 8080, outputDir: null, dockerfile: false, detected };
  }

  // Go
  if (has("go.mod")) {
    detected.push("Go");
    return { language: "go", framework: "go", runtime: "go", packageManager: "npm", installCmd: "go mod download", buildCmd: "go build -o app .", startCmd: "./app", port: 8080, outputDir: null, dockerfile: false, detected };
  }

  // Ruby
  if (has("Gemfile")) {
    detected.push("Ruby");
    const isRails = await exists(path.join(dir, "config/application.rb"));
    return { language: "ruby", framework: isRails ? "rails" : "ruby", runtime: "ruby", packageManager: "npm", installCmd: "bundle install", buildCmd: null, startCmd: isRails ? "bundle exec rails server -b 0.0.0.0 -p $PORT" : "ruby app.rb", port: 3000, outputDir: null, dockerfile: false, detected };
  }

  // Default: static
  detected.push("Unknown — defaulting to static");
  return { language: "html", framework: "static", runtime: "node", packageManager: "npm", installCmd: "", buildCmd: null, startCmd: `npx serve -s . -l $PORT`, port: 3000, outputDir: null, dockerfile: false, detected };
}

export function generateDockerfile(stack: StackInfo): string {
  const pm = stack.packageManager ?? "npm";
  if (stack.language === "javascript" || stack.language === "typescript") {
    const isBuild = !!stack.buildCmd;
    let installLine = "";
    if (pm === "pnpm") {
      installLine = `RUN npm install -g pnpm && pnpm install --no-frozen-lockfile`;
    } else if (pm === "yarn") {
      installLine = `RUN yarn install --non-interactive`;
    } else if (pm === "bun") {
      installLine = `RUN npm install -g bun && bun install`;
    } else {
      installLine = `RUN npm install --production=false --legacy-peer-deps`;
    }
    return `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
${pm === "pnpm" ? "COPY pnpm-lock.yaml* ./" : pm === "yarn" ? "COPY yarn.lock* ./" : ""}
${installLine}
COPY . .
${isBuild ? `RUN ${stack.buildCmd}` : ""}
EXPOSE 3000
ENV PORT=3000
CMD ${JSON.stringify(stack.startCmd.split(" "))}
`;
  }
  if (stack.language === "python") {
    return `FROM python:3.11-slim
WORKDIR /app
${stack.installCmd ? `COPY requirements*.txt ./\nRUN ${stack.installCmd}` : ""}
COPY . .
EXPOSE 8000
ENV PORT=8000
CMD ${JSON.stringify(stack.startCmd.replace("$PORT", "8000").split(" "))}
`;
  }
  if (stack.language === "php") {
    return `FROM php:8.2-cli
WORKDIR /app
COPY . .
EXPOSE 8080
ENV PORT=8080
CMD ["php", "-S", "0.0.0.0:8080"]
`;
  }
  return `FROM ubuntu:22.04
WORKDIR /app
COPY . .
EXPOSE 3000
ENV PORT=3000
CMD ["sh", "-c", "echo 'Add your start command'"]
`;
}
