import { readdir, readFile, access } from "fs/promises";
import path from "path";

export interface StackInfo {
  language: string;
  framework: string;
  runtime: string;
  packageManager: string;
  installCmd: string | null;
  buildCmd: string | null;
  startCmd: string;
  port: number;
  outputDir: string | null;
  dockerfile: boolean;
  procfile: Record<string, string> | null;
  detected: string[];
  confidence: "high" | "medium" | "low";
  appKind: "web" | "worker" | "static";
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function readText(p: string): Promise<string> {
  try { return await readFile(p, "utf8"); } catch { return ""; }
}

async function readJson(p: string): Promise<any> {
  try { return JSON.parse(await readFile(p, "utf8")); } catch { return null; }
}

/** Parse a Procfile into a map of process type -> command */
async function parseProcfile(dir: string): Promise<Record<string, string> | null> {
  const content = await readText(path.join(dir, "Procfile"));
  if (!content) return null;
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const m = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
    if (m) result[m[1].trim()] = m[2].trim();
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** Detect Node.js package manager from root-level lockfiles */
export function detectPackageManager(files: string[]): "npm" | "pnpm" | "yarn" | "bun" {
  if (files.includes("bun.lockb") || files.includes("bun.lock")) return "bun";
  if (files.includes("pnpm-lock.yaml") || files.includes("pnpm-workspace.yaml")) return "pnpm";
  if (files.includes("yarn.lock")) return "yarn";
  return "npm";
}

function pmRun(pm: "npm" | "pnpm" | "yarn" | "bun", script: string): string {
  return `${pm === "npm" ? "npm" : pm} run ${script}`;
}

function pmInstall(pm: "npm" | "pnpm" | "yarn" | "bun"): string {
  switch (pm) {
    case "pnpm": return "pnpm install --no-frozen-lockfile";
    case "yarn": return "yarn install --non-interactive";
    case "bun":  return "bun install";
    default:     return "npm install --production=false --legacy-peer-deps";
  }
}

/** Detect Python sub-framework from requirements.txt / pyproject.toml contents */
function detectPythonFramework(req: string, pyproject: string, files: string[]): {
  framework: string; startCmd: string; port: number; appKind: "web" | "worker";
} {
  const has = (s: string) => req.toLowerCase().includes(s.toLowerCase()) || pyproject.toLowerCase().includes(s.toLowerCase());
  const hasFile = (f: string) => files.includes(f);

  // ASGI frameworks
  if (has("fastapi") || has("uvicorn")) {
    const module = hasFile("main.py") ? "main" : hasFile("app.py") ? "app" : hasFile("server.py") ? "server" : "app";
    const appVar = "app";
    return { framework: "fastapi", startCmd: `uvicorn ${module}:${appVar} --host 0.0.0.0 --port $PORT`, port: 8000, appKind: "web" };
  }
  if (has("starlette")) {
    return { framework: "starlette", startCmd: "uvicorn app:app --host 0.0.0.0 --port $PORT", port: 8000, appKind: "web" };
  }
  if (has("litestar")) {
    return { framework: "litestar", startCmd: "litestar run --host 0.0.0.0 --port $PORT", port: 8000, appKind: "web" };
  }
  if (has("sanic")) {
    return { framework: "sanic", startCmd: "python server.py", port: 8000, appKind: "web" };
  }
  if (has("aiohttp")) {
    return { framework: "aiohttp", startCmd: "python server.py", port: 8080, appKind: "web" };
  }
  if (has("tornado")) {
    return { framework: "tornado", startCmd: "python server.py", port: 8888, appKind: "web" };
  }

  // WSGI frameworks
  if (has("django")) {
    return { framework: "django", startCmd: "python manage.py runserver 0.0.0.0:$PORT", port: 8000, appKind: "web" };
  }
  if (has("flask")) {
    return { framework: "flask", startCmd: "python app.py", port: 5000, appKind: "web" };
  }
  if (has("bottle")) {
    return { framework: "bottle", startCmd: "python app.py", port: 8080, appKind: "web" };
  }
  if (has("falcon")) {
    return { framework: "falcon", startCmd: "gunicorn app:app --bind 0.0.0.0:$PORT", port: 8000, appKind: "web" };
  }

  // Data / ML tools
  if (has("streamlit")) {
    return { framework: "streamlit", startCmd: "streamlit run app.py --server.port=$PORT --server.address=0.0.0.0", port: 8501, appKind: "web" };
  }
  if (has("gradio")) {
    return { framework: "gradio", startCmd: "python app.py", port: 7860, appKind: "web" };
  }
  if (has("dash")) {
    return { framework: "dash", startCmd: "python app.py", port: 8050, appKind: "web" };
  }

  // Bots
  if (has("discord.py") || has("discord-py") || has("nextcord") || has("py-cord") || has("disnake") || has("hikari")) {
    return { framework: "discord-bot", startCmd: hasFile("main.py") ? "python main.py" : "python bot.py", port: 0, appKind: "worker" };
  }
  if (has("python-telegram-bot") || has("aiogram") || has("pyrogram") || has("telethon")) {
    return { framework: "telegram-bot", startCmd: hasFile("main.py") ? "python main.py" : "python bot.py", port: 0, appKind: "worker" };
  }
  if (has("tweepy") || has("twitter")) {
    return { framework: "twitter-bot", startCmd: "python bot.py", port: 0, appKind: "worker" };
  }

  // Generic Python script
  const entry = ["main.py", "app.py", "server.py", "bot.py", "run.py", "index.py"].find(f => files.includes(f)) ?? "app.py";
  return { framework: "python", startCmd: `python ${entry}`, port: 8000, appKind: "web" };
}

/** Detect Node.js framework from package.json deps */
function detectNodeFramework(deps: Record<string, string>, scripts: Record<string, string>, files: string[]): {
  framework: string; buildCmd: string | null; startCmd: string; port: number;
  outputDir: string | null; appKind: "web" | "worker" | "static";
} {
  const has = (pkg: string) => deps[pkg] !== undefined;

  // ── Bots & background workers ──────────────────────────────────────────────
  if (has("discord.js") || has("@discordjs/rest") || has("discord-api-types") || has("eris") || has("oceanic.js") || has("discordeno")) {
    const startCmd = scripts.start ? "npm run start" : files.includes("dist/index.js") ? "node dist/index.js" : "node index.js";
    return { framework: "discord-bot", buildCmd: scripts.build ? "npm run build" : null, startCmd, port: 0, outputDir: null, appKind: "worker" };
  }
  if (has("telegraf") || has("node-telegram-bot-api") || has("grammy") || has("telebot") || has("telegramsjs")) {
    return { framework: "telegram-bot", buildCmd: scripts.build ? "npm run build" : null, startCmd: scripts.start ? "npm run start" : "node index.js", port: 0, outputDir: null, appKind: "worker" };
  }
  if (has("twitter-api-v2") || has("twit") || has("twitter-lite")) {
    return { framework: "twitter-bot", buildCmd: scripts.build ? "npm run build" : null, startCmd: scripts.start ? "npm run start" : "node bot.js", port: 0, outputDir: null, appKind: "worker" };
  }
  if (has("whatsapp-web.js") || has("@whiskeysockets/baileys") || has("baileys") || has("@adiwajshing/baileys")) {
    return { framework: "whatsapp-bot", buildCmd: scripts.build ? "npm run build" : null, startCmd: scripts.start ? "npm run start" : "node index.js", port: 0, outputDir: null, appKind: "worker" };
  }
  if (has("tmi.js") || has("@twurple/api") || has("twitch.js")) {
    return { framework: "twitch-bot", buildCmd: scripts.build ? "npm run build" : null, startCmd: scripts.start ? "npm run start" : "node bot.js", port: 0, outputDir: null, appKind: "worker" };
  }
  if (has("bull") || has("bullmq") || has("bee-queue") || has("agenda") || has("node-cron")) {
    if (!has("express") && !has("fastify") && !has("koa") && !has("hapi") && !has("@hapi/hapi")) {
      return { framework: "node-worker", buildCmd: scripts.build ? "npm run build" : null, startCmd: scripts.start ? "npm run start" : "node worker.js", port: 0, outputDir: null, appKind: "worker" };
    }
  }

  // ── SSR / Fullstack frameworks ─────────────────────────────────────────────
  if (has("next")) {
    return { framework: "nextjs", buildCmd: "npm run build", startCmd: "npm run start", port: 3000, outputDir: ".next", appKind: "web" };
  }
  if (has("nuxt") || has("nuxt3") || has("@nuxt/core")) {
    return { framework: "nuxt", buildCmd: "npm run build", startCmd: "npm run start", port: 3000, outputDir: ".output", appKind: "web" };
  }
  if (has("@adonisjs/core")) {
    return { framework: "adonisjs", buildCmd: "node ace build --production", startCmd: "node build/server.js", port: 3333, outputDir: "build", appKind: "web" };
  }
  if (has("@nestjs/core")) {
    return { framework: "nestjs", buildCmd: "npm run build", startCmd: scripts["start:prod"] ? "npm run start:prod" : "node dist/main.js", port: 3000, outputDir: "dist", appKind: "web" };
  }
  if (has("remix") || has("@remix-run/node")) {
    return { framework: "remix", buildCmd: "npm run build", startCmd: "npm run start", port: 3000, outputDir: "build", appKind: "web" };
  }

  // ── Static / SPA frameworks ───────────────────────────────────────────────
  if (has("vite") && has("react")) {
    return { framework: "react-vite", buildCmd: "npm run build", startCmd: "npx serve dist -l $PORT", port: 3000, outputDir: "dist", appKind: "static" };
  }
  if (has("vite") && has("vue")) {
    return { framework: "vue", buildCmd: "npm run build", startCmd: "npx serve dist -l $PORT", port: 3000, outputDir: "dist", appKind: "static" };
  }
  if (has("vite") && has("svelte")) {
    return { framework: "svelte-vite", buildCmd: "npm run build", startCmd: "npx serve dist -l $PORT", port: 3000, outputDir: "dist", appKind: "static" };
  }
  if (has("vite")) {
    return { framework: "vite", buildCmd: "npm run build", startCmd: "npx serve dist -l $PORT", port: 3000, outputDir: "dist", appKind: "static" };
  }
  if (has("react-scripts")) {
    return { framework: "create-react-app", buildCmd: "npm run build", startCmd: "npx serve build -l $PORT", port: 3000, outputDir: "build", appKind: "static" };
  }
  if (has("@sveltejs/kit") || has("svelte")) {
    return { framework: "svelte", buildCmd: "npm run build", startCmd: "npm run preview", port: 3000, outputDir: "build", appKind: "static" };
  }
  if (has("gatsby")) {
    return { framework: "gatsby", buildCmd: "npm run build", startCmd: "npx serve public -l $PORT", port: 3000, outputDir: "public", appKind: "static" };
  }
  if (has("astro")) {
    return { framework: "astro", buildCmd: "npm run build", startCmd: "npx serve dist -l $PORT", port: 3000, outputDir: "dist", appKind: "static" };
  }
  if (has("@11ty/eleventy")) {
    return { framework: "eleventy", buildCmd: "npm run build", startCmd: "npx serve _site -l $PORT", port: 3000, outputDir: "_site", appKind: "static" };
  }
  if (has("hexo")) {
    return { framework: "hexo", buildCmd: "npx hexo generate", startCmd: "npx serve public -l $PORT", port: 3000, outputDir: "public", appKind: "static" };
  }

  // ── HTTP servers ──────────────────────────────────────────────────────────
  if (has("express")) {
    const entry = ["dist/index.js", "dist/server.js", "dist/app.js", "server.js", "index.js", "app.js"].find(f => files.includes(f)) ?? "index.js";
    return { framework: "express", buildCmd: scripts.build ? "npm run build" : null, startCmd: scripts.start ? "npm run start" : `node ${entry}`, port: 3000, outputDir: null, appKind: "web" };
  }
  if (has("fastify")) {
    return { framework: "fastify", buildCmd: scripts.build ? "npm run build" : null, startCmd: scripts.start ? "npm run start" : "node server.js", port: 3000, outputDir: null, appKind: "web" };
  }
  if (has("@hapi/hapi") || has("hapi")) {
    return { framework: "hapi", buildCmd: scripts.build ? "npm run build" : null, startCmd: scripts.start ? "npm run start" : "node server.js", port: 3000, outputDir: null, appKind: "web" };
  }
  if (has("koa")) {
    return { framework: "koa", buildCmd: scripts.build ? "npm run build" : null, startCmd: scripts.start ? "npm run start" : "node app.js", port: 3000, outputDir: null, appKind: "web" };
  }
  if (has("@trpc/server")) {
    return { framework: "trpc", buildCmd: scripts.build ? "npm run build" : null, startCmd: scripts.start ? "npm run start" : "node server.js", port: 3000, outputDir: null, appKind: "web" };
  }

  // Generic Node.js
  const entry = ["dist/index.js", "dist/server.js", "server.js", "index.js", "app.js", "main.js"].find(f => files.includes(f)) ?? "index.js";
  return {
    framework: "node",
    buildCmd: scripts.build ? "npm run build" : null,
    startCmd: scripts.start ? "npm run start" : `node ${entry}`,
    port: 3000, outputDir: null, appKind: "web",
  };
}

/**
 * Fully detect the language, framework, install/build/start commands
 * for a project at the given directory. Checks:
 *   - Procfile (highest priority for start cmd)
 *   - Dockerfile
 *   - package.json (Node.js)
 *   - requirements.txt / pyproject.toml / Pipfile (Python)
 *   - Gemfile (Ruby)
 *   - composer.json (PHP)
 *   - go.mod (Go)
 *   - Cargo.toml (Rust)
 *   - pom.xml / build.gradle (Java)
 *   - deno.json (Deno)
 *   - index.html (Static)
 */
export async function detectStack(dir: string): Promise<StackInfo> {
  const rawFiles = await readdir(dir).catch(() => [] as string[]);
  const files = rawFiles.map(f => f.toLowerCase().trim());
  const rawFilesLower = new Set(files);
  const has = (f: string) => rawFilesLower.has(f.toLowerCase());
  const detected: string[] = [];

  // Parse Procfile first — it overrides start commands
  const procfile = await parseProcfile(dir);
  if (procfile) detected.push(`Procfile (${Object.keys(procfile).join(", ")})`);

  // ── Dockerfile ────────────────────────────────────────────────────────────
  if (has("Dockerfile") || has("dockerfile")) {
    detected.push("Dockerfile");
    return {
      language: "docker", framework: "docker", runtime: "docker", packageManager: "none",
      installCmd: null, buildCmd: null,
      startCmd: procfile?.web ?? "docker run -p $PORT:$PORT app",
      port: 3000, outputDir: null, dockerfile: true, procfile, detected,
      confidence: "high", appKind: "web",
    };
  }

  // ── Node.js ──────────────────────────────────────────────────────────────
  if (has("package.json")) {
    detected.push("package.json");
    const pkg = await readJson(path.join(dir, "package.json"));
    const deps: Record<string, string> = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}), ...(pkg?.peerDependencies ?? {}) };
    const scripts: Record<string, string> = pkg?.scripts ?? {};
    const pm = detectPackageManager(rawFiles);
    detected.push(`package-manager: ${pm}`);

    // Detect TypeScript — might need ts-node or tsc
    const isTS = has("tsconfig.json") || Object.keys(deps).includes("typescript");
    if (isTS) detected.push("TypeScript");

    const node = detectNodeFramework(deps, scripts, rawFiles);
    detected.push(`framework: ${node.framework}`);

    // If Procfile web: override start
    const startCmd = procfile?.web ?? node.startCmd;

    // Adjust pm-specific commands
    const installCmd = pmInstall(pm);
    const buildCmd = node.buildCmd ? node.buildCmd.replace("npm run", pmRun(pm, "").replace(" ", "npm run ").replace("npm run ", `${pm === "npm" ? "npm" : pm} run `)) : null;
    // Simpler: just replace npm with the right pm in build
    const finalBuild = node.buildCmd
      ? node.buildCmd.replace(/^npm /, `${pm === "npm" ? "npm" : pm} `)
      : null;

    return {
      language: isTS ? "typescript" : "javascript",
      framework: node.framework,
      runtime: "node",
      packageManager: pm,
      installCmd,
      buildCmd: finalBuild,
      startCmd,
      port: node.port,
      outputDir: node.outputDir,
      dockerfile: false,
      procfile,
      detected,
      confidence: "high",
      appKind: node.appKind,
    };
  }

  // ── Python ───────────────────────────────────────────────────────────────
  if (has("requirements.txt") || has("pyproject.toml") || has("setup.py") || has("setup.cfg") || has("pipfile") || has("uv.lock")) {
    detected.push("Python project");

    const req       = await readText(path.join(dir, "requirements.txt"));
    const pyproject = await readText(path.join(dir, "pyproject.toml"));
    const pipfile   = await readText(path.join(dir, "Pipfile"));

    // Detect Python package manager
    let pm = "pip";
    let installCmd: string;

    if (has("uv.lock") || pyproject.includes("[tool.uv]")) {
      pm = "uv";
      installCmd = has("requirements.txt")
        ? "uv pip install -r requirements.txt --system"
        : "uv pip install -e . --system";
      detected.push("uv");
    } else if (has("pipfile")) {
      pm = "pipenv";
      installCmd = "pipenv install --deploy --system";
      detected.push("Pipfile (pipenv)");
    } else if (pyproject.includes("[tool.poetry]")) {
      pm = "poetry";
      installCmd = "poetry install --no-interaction --no-ansi";
      detected.push("pyproject.toml (poetry)");
    } else if (pyproject.includes("[build-system]") || pyproject.includes("[project]")) {
      pm = "pip";
      installCmd = has("requirements.txt")
        ? "pip install -r requirements.txt --no-cache-dir"
        : "pip install -e . --no-cache-dir";
      detected.push("pyproject.toml (pip)");
    } else {
      pm = "pip";
      installCmd = has("requirements.txt")
        ? "pip install -r requirements.txt --no-cache-dir"
        : "pip install -e . --no-cache-dir || true";
      detected.push("requirements.txt");
    }

    const combined = req + "\n" + pyproject + "\n" + pipfile;
    const py = detectPythonFramework(combined, pyproject, rawFiles);
    detected.push(`framework: ${py.framework}`);

    const startCmd = procfile?.web ?? py.startCmd;

    return {
      language: "python",
      framework: py.framework,
      runtime: "python3",
      packageManager: pm,
      installCmd,
      buildCmd: null,
      startCmd,
      port: py.port,
      outputDir: null,
      dockerfile: false,
      procfile,
      detected,
      confidence: "high",
      appKind: py.appKind,
    };
  }

  // ── Ruby ──────────────────────────────────────────────────────────────────
  if (has("gemfile")) {
    detected.push("Gemfile (Ruby)");
    const isRails = await fileExists(path.join(dir, "config", "application.rb"));
    const isSinatra = (await readText(path.join(dir, "Gemfile"))).includes("sinatra");
    let framework = "ruby";
    let startCmd = "ruby app.rb";
    let port = 4567;

    if (isRails) {
      framework = "rails";
      startCmd = "bundle exec rails server -b 0.0.0.0 -p $PORT";
      port = 3000;
      detected.push("Rails");
    } else if (isSinatra) {
      framework = "sinatra";
      startCmd = "bundle exec ruby app.rb -o 0.0.0.0 -p $PORT";
      port = 4567;
      detected.push("Sinatra");
    } else {
      const entry = ["app.rb", "server.rb", "main.rb", "bot.rb"].find(f => rawFiles.includes(f)) ?? "app.rb";
      startCmd = `bundle exec ruby ${entry}`;
      detected.push("Ruby script");
    }

    return {
      language: "ruby", framework, runtime: "ruby", packageManager: "bundler",
      installCmd: "bundle install",
      buildCmd: isRails ? "bundle exec rails assets:precompile" : null,
      startCmd: procfile?.web ?? startCmd,
      port, outputDir: isRails ? "public" : null,
      dockerfile: false, procfile, detected, confidence: "high",
      appKind: "web",
    };
  }

  // ── PHP ───────────────────────────────────────────────────────────────────
  if (has("composer.json") || has("index.php")) {
    detected.push("PHP project");
    const hasComposer = has("composer.json");
    const isLaravel = await fileExists(path.join(dir, "artisan"));
    let framework = "php";
    let startCmd = "php -S 0.0.0.0:$PORT";
    let port = 8080;

    if (isLaravel) {
      framework = "laravel";
      startCmd = "php artisan serve --host=0.0.0.0 --port=$PORT";
      port = 8000;
      detected.push("Laravel");
    } else {
      detected.push("PHP built-in server");
    }

    return {
      language: "php", framework, runtime: "php", packageManager: "composer",
      installCmd: hasComposer ? "composer install --no-dev --optimize-autoloader --no-interaction" : null,
      buildCmd: isLaravel ? "php artisan config:cache && php artisan route:cache" : null,
      startCmd: procfile?.web ?? startCmd,
      port, outputDir: isLaravel ? "public" : null,
      dockerfile: false, procfile, detected, confidence: "high",
      appKind: "web",
    };
  }

  // ── Go ────────────────────────────────────────────────────────────────────
  if (has("go.mod")) {
    detected.push("Go module (go.mod)");
    const goMod = await readText(path.join(dir, "go.mod"));
    const moduleName = goMod.match(/^module\s+(\S+)/m)?.[1] ?? "app";
    const binary = moduleName.split("/").pop() ?? "app";
    return {
      language: "go", framework: "go", runtime: "go", packageManager: "go",
      installCmd: "go mod download",
      buildCmd: `go build -o ${binary} .`,
      startCmd: procfile?.web ?? `./${binary}`,
      port: 8080, outputDir: null,
      dockerfile: false, procfile, detected, confidence: "high",
      appKind: "web",
    };
  }

  // ── Rust ──────────────────────────────────────────────────────────────────
  if (has("cargo.toml")) {
    detected.push("Cargo.toml (Rust)");
    const cargo = await readJson(path.join(dir, "Cargo.toml"));
    const name = cargo?.package?.name ?? "app";
    return {
      language: "rust", framework: "rust", runtime: "cargo", packageManager: "cargo",
      installCmd: null,
      buildCmd: "cargo build --release",
      startCmd: procfile?.web ?? `./target/release/${name}`,
      port: 8080, outputDir: null,
      dockerfile: false, procfile, detected, confidence: "high",
      appKind: "web",
    };
  }

  // ── Java (Maven) ──────────────────────────────────────────────────────────
  if (has("pom.xml")) {
    detected.push("pom.xml (Maven)");
    const isSpring = (await readText(path.join(dir, "pom.xml"))).includes("spring");
    return {
      language: "java", framework: isSpring ? "spring" : "java", runtime: "java", packageManager: "maven",
      installCmd: null,
      buildCmd: "./mvnw package -DskipTests || mvn package -DskipTests",
      startCmd: procfile?.web ?? "java -jar target/*.jar",
      port: 8080, outputDir: "target",
      dockerfile: false, procfile, detected, confidence: "high",
      appKind: "web",
    };
  }

  // ── Java (Gradle) ────────────────────────────────────────────────────────
  if (has("build.gradle") || has("build.gradle.kts")) {
    detected.push(`${has("build.gradle.kts") ? "build.gradle.kts" : "build.gradle"} (Gradle)`);
    return {
      language: "java", framework: "gradle", runtime: "java", packageManager: "gradle",
      installCmd: null,
      buildCmd: "./gradlew build -x test || gradle build -x test",
      startCmd: procfile?.web ?? "java -jar build/libs/*.jar",
      port: 8080, outputDir: "build/libs",
      dockerfile: false, procfile, detected, confidence: "high",
      appKind: "web",
    };
  }

  // ── Deno ─────────────────────────────────────────────────────────────────
  if (has("deno.json") || has("deno.jsonc") || has("deps.ts")) {
    detected.push("Deno project");
    const denoJson = await readJson(path.join(dir, "deno.json")) ?? await readJson(path.join(dir, "deno.jsonc"));
    const tasks = denoJson?.tasks ?? {};
    const entry = denoJson?.main ?? "main.ts";
    const startCmd = tasks.start
      ? "deno task start"
      : `deno run --allow-all ${entry}`;
    return {
      language: "typescript", framework: "deno", runtime: "deno", packageManager: "none",
      installCmd: null,
      buildCmd: tasks.build ? "deno task build" : null,
      startCmd: procfile?.web ?? startCmd,
      port: 8000, outputDir: null,
      dockerfile: false, procfile, detected, confidence: "high",
      appKind: "web",
    };
  }

  // ── Bun (no package.json, has bunfig) ────────────────────────────────────
  if (has("bunfig.toml")) {
    detected.push("Bun project (bunfig.toml)");
    return {
      language: "javascript", framework: "bun", runtime: "bun", packageManager: "bun",
      installCmd: "bun install",
      buildCmd: null,
      startCmd: procfile?.web ?? "bun run index.ts",
      port: 3000, outputDir: null,
      dockerfile: false, procfile, detected, confidence: "medium",
      appKind: "web",
    };
  }

  // ── Static HTML ───────────────────────────────────────────────────────────
  if (has("index.html")) {
    detected.push("Static HTML");
    return {
      language: "html", framework: "static", runtime: "node", packageManager: "none",
      installCmd: null,
      buildCmd: null,
      startCmd: "npx serve . -l $PORT",
      port: 3000, outputDir: null,
      dockerfile: false, procfile, detected, confidence: "medium",
      appKind: "static",
    };
  }

  // ── Unknown fallback ──────────────────────────────────────────────────────
  detected.push("Unknown — inspect directory manually");
  return {
    language: "unknown", framework: "unknown", runtime: "node", packageManager: "none",
    installCmd: null, buildCmd: null,
    startCmd: procfile?.web ?? "node index.js",
    port: 3000, outputDir: null,
    dockerfile: false, procfile, detected, confidence: "low",
    appKind: "web",
  };
}

/** Generate a Dockerfile for the detected stack */
export function generateDockerfile(stack: StackInfo): string {
  switch (stack.language) {
    case "javascript":
    case "typescript": {
      const pm = stack.packageManager as "npm" | "pnpm" | "yarn" | "bun";
      const pmSetup = pm === "pnpm" ? "RUN npm install -g pnpm" : pm === "bun" ? "RUN npm install -g bun" : "";
      const installLine = pmInstall(pm);
      const baseImage = pm === "bun" ? "oven/bun:1-alpine" : "node:20-alpine";
      return [
        `FROM ${baseImage}`,
        "WORKDIR /app",
        pmSetup,
        "COPY package*.json ./",
        pm === "pnpm" ? "COPY pnpm-lock.yaml* ./" : pm === "yarn" ? "COPY yarn.lock* ./" : "",
        `RUN ${installLine}`,
        "COPY . .",
        stack.buildCmd ? `RUN ${stack.buildCmd}` : "",
        `EXPOSE ${stack.port}`,
        `ENV PORT=${stack.port}`,
        `CMD ${JSON.stringify(["sh", "-c", stack.startCmd])}`,
      ].filter(Boolean).join("\n");
    }
    case "python": {
      const baseImage = "python:3.12-slim";
      const installLine = stack.installCmd ?? "pip install -r requirements.txt --no-cache-dir";
      return [
        `FROM ${baseImage}`,
        "WORKDIR /app",
        "COPY requirements*.txt pyproject.toml* ./",
        `RUN ${installLine}`,
        "COPY . .",
        `EXPOSE ${stack.port}`,
        `ENV PORT=${stack.port}`,
        `CMD ["sh", "-c", "${stack.startCmd.replace(/"/g, '\\"')}"]`,
      ].filter(Boolean).join("\n");
    }
    case "ruby": {
      return [
        "FROM ruby:3.3-slim",
        "WORKDIR /app",
        "COPY Gemfile* ./",
        "RUN bundle install",
        "COPY . .",
        `EXPOSE ${stack.port}`,
        `ENV PORT=${stack.port}`,
        `CMD ["sh", "-c", "${stack.startCmd.replace(/"/g, '\\"')}"]`,
      ].join("\n");
    }
    case "go": {
      return [
        "FROM golang:1.22-alpine AS build",
        "WORKDIR /app",
        "COPY go.mod go.sum* ./",
        "RUN go mod download",
        "COPY . .",
        `RUN ${stack.buildCmd ?? "go build -o app ."}`,
        "FROM alpine:latest",
        "WORKDIR /app",
        `COPY --from=build /app/${stack.startCmd.replace("./", "")} .`,
        `EXPOSE ${stack.port}`,
        `ENV PORT=${stack.port}`,
        `CMD ["./${stack.startCmd.replace("./", "")}"]`,
      ].join("\n");
    }
    case "rust": {
      return [
        "FROM rust:1.78 AS build",
        "WORKDIR /app",
        "COPY . .",
        "RUN cargo build --release",
        "FROM debian:bookworm-slim",
        "WORKDIR /app",
        `COPY --from=build /app/target/release/${stack.framework} .`,
        `EXPOSE ${stack.port}`,
        `ENV PORT=${stack.port}`,
        `CMD ["./${stack.framework}"]`,
      ].join("\n");
    }
    case "php": {
      return [
        "FROM php:8.3-cli",
        "WORKDIR /app",
        stack.installCmd ? "COPY composer* ./" : "",
        stack.installCmd ? `RUN ${stack.installCmd}` : "",
        "COPY . .",
        `EXPOSE ${stack.port}`,
        `ENV PORT=${stack.port}`,
        `CMD ["php", "-S", "0.0.0.0:${stack.port}"]`,
      ].filter(Boolean).join("\n");
    }
    case "java": {
      return [
        "FROM eclipse-temurin:21-jdk AS build",
        "WORKDIR /app",
        "COPY . .",
        `RUN ${stack.buildCmd ?? "mvn package -DskipTests"}`,
        "FROM eclipse-temurin:21-jre",
        "WORKDIR /app",
        "COPY --from=build /app/target/*.jar app.jar",
        `EXPOSE ${stack.port}`,
        `ENV PORT=${stack.port}`,
        'CMD ["java", "-jar", "app.jar"]',
      ].join("\n");
    }
    default:
      return `FROM ubuntu:22.04\nWORKDIR /app\nCOPY . .\nEXPOSE 3000\nENV PORT=3000\nCMD ["sh", "-c", "${stack.startCmd}"]`;
  }
}
