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

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}
async function readText(p: string): Promise<string> {
  try { return await readFile(p, "utf8"); } catch { return ""; }
}
async function readJson(p: string): Promise<any> {
  try { return JSON.parse(await readFile(p, "utf8")); } catch { return null; }
}

/** Parse a Procfile into process type → command map */
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

/** Detect Node.js package manager from lockfiles */
export function detectPackageManager(files: string[]): "npm" | "pnpm" | "yarn" | "bun" {
  const set = new Set(files.map(f => f.toLowerCase()));
  if (set.has("bun.lockb") || set.has("bun.lock")) return "bun";
  if (set.has("pnpm-lock.yaml") || set.has("pnpm-workspace.yaml")) return "pnpm";
  if (set.has("yarn.lock")) return "yarn";
  return "npm";
}

function pmInstall(pm: "npm" | "pnpm" | "yarn" | "bun"): string {
  switch (pm) {
    case "pnpm": return "pnpm install --no-frozen-lockfile";
    case "yarn": return "yarn install --non-interactive";
    case "bun":  return "bun install";
    default:     return "npm install --production=false --legacy-peer-deps";
  }
}

/** Determine Python sub-framework from file contents */
function detectPythonFramework(combined: string, files: string[]): {
  framework: string; startCmd: string; port: number; appKind: "web" | "worker";
} {
  const low = combined.toLowerCase();
  const has = (s: string) => low.includes(s.toLowerCase());
  const hasFile = (f: string) => files.some(x => x.toLowerCase() === f.toLowerCase());

  // ASGI / fast async
  if (has("fastapi") || (has("uvicorn") && !has("gunicorn"))) {
    const mod = ["main", "app", "server", "api"].find(m => hasFile(`${m}.py`)) ?? "app";
    return { framework: "fastapi", startCmd: `uvicorn ${mod}:app --host 0.0.0.0 --port $PORT`, port: 8000, appKind: "web" };
  }
  if (has("starlette")) {
    const mod = ["main", "app", "server"].find(m => hasFile(`${m}.py`)) ?? "app";
    return { framework: "starlette", startCmd: `uvicorn ${mod}:app --host 0.0.0.0 --port $PORT`, port: 8000, appKind: "web" };
  }
  if (has("litestar")) {
    return { framework: "litestar", startCmd: "litestar run --host 0.0.0.0 --port $PORT", port: 8000, appKind: "web" };
  }
  if (has("sanic")) {
    const mod = ["server", "app", "main"].find(m => hasFile(`${m}.py`)) ?? "server";
    return { framework: "sanic", startCmd: `python ${mod}.py`, port: 8000, appKind: "web" };
  }
  if (has("aiohttp")) {
    return { framework: "aiohttp", startCmd: "python server.py", port: 8080, appKind: "web" };
  }
  if (has("tornado")) {
    const mod = ["server", "app", "main"].find(m => hasFile(`${m}.py`)) ?? "server";
    return { framework: "tornado", startCmd: `python ${mod}.py`, port: 8888, appKind: "web" };
  }

  // WSGI
  if (has("django")) {
    return { framework: "django", startCmd: "python manage.py runserver 0.0.0.0:$PORT", port: 8000, appKind: "web" };
  }
  if (has("flask")) {
    const mod = ["app", "main", "server", "run"].find(m => hasFile(`${m}.py`)) ?? "app";
    return { framework: "flask", startCmd: `python ${mod}.py`, port: 5000, appKind: "web" };
  }
  if (has("bottle")) {
    return { framework: "bottle", startCmd: "python app.py", port: 8080, appKind: "web" };
  }
  if (has("falcon")) {
    return { framework: "falcon", startCmd: "gunicorn app:app --bind 0.0.0.0:$PORT", port: 8000, appKind: "web" };
  }

  // Data / ML
  if (has("streamlit")) {
    const mod = ["app", "main", "streamlit_app"].find(m => hasFile(`${m}.py`)) ?? "app";
    return { framework: "streamlit", startCmd: `streamlit run ${mod}.py --server.port $PORT --server.address 0.0.0.0`, port: 8501, appKind: "web" };
  }
  if (has("gradio")) {
    const mod = ["app", "main"].find(m => hasFile(`${m}.py`)) ?? "app";
    return { framework: "gradio", startCmd: `python ${mod}.py`, port: 7860, appKind: "web" };
  }
  if (has("dash")) {
    const mod = ["app", "main"].find(m => hasFile(`${m}.py`)) ?? "app";
    return { framework: "dash", startCmd: `python ${mod}.py`, port: 8050, appKind: "web" };
  }

  // Bots
  if (has("discord.py") || has("nextcord") || has("py-cord") || has("disnake") || has("hikari") || has("interactions.py")) {
    const mod = ["main", "bot", "index"].find(m => hasFile(`${m}.py`)) ?? "main";
    return { framework: "discord-bot", startCmd: `python ${mod}.py`, port: 0, appKind: "worker" };
  }
  if (has("python-telegram-bot") || has("aiogram") || has("pyrogram") || has("telethon") || has("pytelegrambotapi")) {
    const mod = ["main", "bot"].find(m => hasFile(`${m}.py`)) ?? "bot";
    return { framework: "telegram-bot", startCmd: `python ${mod}.py`, port: 0, appKind: "worker" };
  }
  if (has("tweepy")) {
    return { framework: "twitter-bot", startCmd: "python bot.py", port: 0, appKind: "worker" };
  }

  // Generic Python script — find best entry point
  const entry = ["main.py", "app.py", "server.py", "bot.py", "run.py", "start.py", "index.py"]
    .find(f => hasFile(f)) ?? "main.py";
  return { framework: "python", startCmd: `python ${entry}`, port: 8000, appKind: "web" };
}

/** Detect Node.js framework from package.json */
function detectNodeFramework(deps: Record<string, string>, scripts: Record<string, string>, files: string[]): {
  framework: string; buildCmd: string | null; startCmd: string;
  port: number; outputDir: string | null; appKind: "web" | "worker" | "static";
} {
  const has = (p: string) => p in deps;
  const hasFile = (f: string) => files.some(x => x.toLowerCase() === f.toLowerCase());

  // Bots / background workers — check BEFORE web frameworks
  if (has("discord.js") || has("@discordjs/rest") || has("discord-api-types") || has("eris") || has("oceanic.js") || has("discordeno")) {
    return { framework: "discord-bot", buildCmd: scripts.build ? "npm run build" : null, startCmd: scripts.start ? "npm run start" : hasFile("dist/index.js") ? "node dist/index.js" : "node index.js", port: 0, outputDir: null, appKind: "worker" };
  }
  if (has("telegraf") || has("node-telegram-bot-api") || has("grammy") || has("telebot") || has("@grammyjs/runner")) {
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

  // SSR / fullstack
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
  if (has("remix") || has("@remix-run/node") || has("@remix-run/express")) {
    return { framework: "remix", buildCmd: "npm run build", startCmd: "npm run start", port: 3000, outputDir: "build", appKind: "web" };
  }

  // Static / SPA
  if (has("vite") && (has("react") || has("@vitejs/plugin-react"))) {
    return { framework: "react-vite", buildCmd: scripts.build ? "npm run build" : "npx vite build", startCmd: "npx serve dist -l $PORT", port: 3000, outputDir: "dist", appKind: "static" };
  }
  if (has("vite") && (has("vue") || has("@vitejs/plugin-vue"))) {
    return { framework: "vue-vite", buildCmd: scripts.build ? "npm run build" : "npx vite build", startCmd: "npx serve dist -l $PORT", port: 3000, outputDir: "dist", appKind: "static" };
  }
  if (has("vite") && (has("svelte") || has("@sveltejs/vite-plugin-svelte"))) {
    return { framework: "svelte-vite", buildCmd: scripts.build ? "npm run build" : "npx vite build", startCmd: "npx serve dist -l $PORT", port: 3000, outputDir: "dist", appKind: "static" };
  }
  if (has("vite")) {
    return { framework: "vite", buildCmd: scripts.build ? "npm run build" : "npx vite build", startCmd: "npx serve dist -l $PORT", port: 3000, outputDir: "dist", appKind: "static" };
  }
  if (has("react-scripts")) {
    return { framework: "create-react-app", buildCmd: "npm run build", startCmd: "npx serve build -l $PORT", port: 3000, outputDir: "build", appKind: "static" };
  }
  if (has("@sveltejs/kit")) {
    return { framework: "sveltekit", buildCmd: "npm run build", startCmd: "npm run preview", port: 3000, outputDir: "build", appKind: "web" };
  }
  if (has("svelte")) {
    return { framework: "svelte", buildCmd: "npm run build", startCmd: "npx serve public -l $PORT", port: 3000, outputDir: "public", appKind: "static" };
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

  // HTTP servers
  if (has("express")) {
    const entry = ["dist/index.js", "dist/server.js", "dist/app.js", "server.js", "index.js", "app.js"].find(f => hasFile(f)) ?? "index.js";
    return { framework: "express", buildCmd: scripts.build ? "npm run build" : null, startCmd: scripts.start ? "npm run start" : `node ${entry}`, port: 3000, outputDir: null, appKind: "web" };
  }
  if (has("fastify")) {
    const entry = ["server.js", "index.js", "app.js"].find(f => hasFile(f)) ?? "server.js";
    return { framework: "fastify", buildCmd: scripts.build ? "npm run build" : null, startCmd: scripts.start ? "npm run start" : `node ${entry}`, port: 3000, outputDir: null, appKind: "web" };
  }
  if (has("@hapi/hapi") || has("hapi")) {
    return { framework: "hapi", buildCmd: scripts.build ? "npm run build" : null, startCmd: scripts.start ? "npm run start" : "node server.js", port: 3000, outputDir: null, appKind: "web" };
  }
  if (has("koa")) {
    return { framework: "koa", buildCmd: scripts.build ? "npm run build" : null, startCmd: scripts.start ? "npm run start" : "node app.js", port: 3000, outputDir: null, appKind: "web" };
  }

  // Generic Node.js
  const entry = ["dist/index.js", "dist/server.js", "dist/app.js", "server.js", "index.js", "app.js", "main.js"]
    .find(f => hasFile(f)) ?? "index.js";
  return {
    framework: "node",
    buildCmd: scripts.build ? "npm run build" : null,
    startCmd: scripts.start ? "npm run start" : `node ${entry}`,
    port: 3000, outputDir: null, appKind: "web",
  };
}

/**
 * Determine whether a Python project should take priority over Node.js.
 * Used when BOTH package.json AND requirements.txt/pyproject.toml exist.
 * Python wins when there are Python entry-point files (app.py, main.py etc.)
 * OR when the package.json has workspace: deps (it's just a monorepo tool config).
 */
function pythonHasPriority(files: string[], pkgRaw: string): boolean {
  const set = new Set(files.map(f => f.toLowerCase()));
  // Direct Python entry points
  if (set.has("manage.py")) return true; // Django is unmistakable
  if (set.has("app.py") || set.has("main.py") || set.has("server.py") || set.has("bot.py")) return true;
  // package.json has workspace: deps → it's a monorepo helper, not the real runtime
  if (pkgRaw.includes('"workspace:')) return true;
  return false;
}

/**
 * Fully auto-detect the stack for a project directory.
 *
 * Priority order (matches Render.com + Vercel convention):
 *   1. Procfile (overrides start commands)
 *   2. Dockerfile
 *   3. Python  — checked BEFORE Node when Python entry points exist
 *   4. Node.js
 *   5. Ruby   6. PHP   7. Go   8. Rust   9. Java (Maven/Gradle)
 *  10. Deno  11. Bun  12. Static HTML
 *  13. Unknown fallback
 */
export async function detectStack(dir: string): Promise<StackInfo> {
  const rawFiles = await readdir(dir).catch(() => [] as string[]);
  const lset = new Set(rawFiles.map(f => f.toLowerCase()));
  const hasFile = (f: string) => lset.has(f.toLowerCase());
  const detected: string[] = [];

  // 1. Procfile
  const procfile = await parseProcfile(dir);
  if (procfile) detected.push(`Procfile (${Object.keys(procfile).join(", ")})`);

  // 2. Dockerfile
  if (hasFile("Dockerfile") || hasFile("dockerfile")) {
    detected.push("Dockerfile");
    return { language: "docker", framework: "docker", runtime: "docker", packageManager: "none", installCmd: null, buildCmd: null, startCmd: procfile?.web ?? "docker run -p $PORT:$PORT app", port: 3000, outputDir: null, dockerfile: true, procfile, detected, confidence: "high", appKind: "web" };
  }

  // ── Decide between Python and Node when both exist ──────────────────────
  const hasPythonFiles = hasFile("requirements.txt") || hasFile("pyproject.toml") || hasFile("setup.py") || hasFile("setup.cfg") || hasFile("pipfile") || hasFile("uv.lock");
  const hasNodeFiles   = hasFile("package.json");
  const pkgRaw         = hasNodeFiles ? await readText(path.join(dir, "package.json")) : "";

  const preferPython = hasPythonFiles && (!hasNodeFiles || pythonHasPriority(rawFiles, pkgRaw));

  // 3. Python (may win over Node)
  if (preferPython) {
    detected.push("Python project");
    const req      = await readText(path.join(dir, "requirements.txt"));
    const pyproj   = await readText(path.join(dir, "pyproject.toml"));
    const pipfileC = await readText(path.join(dir, "Pipfile"));
    const combined = req + "\n" + pyproj + "\n" + pipfileC;

    let pm = "pip";
    let installCmd: string | null;

    if (hasFile("uv.lock") || pyproj.includes("[tool.uv]")) {
      pm = "uv";
      installCmd = hasFile("requirements.txt") ? "uv pip install -r requirements.txt --system" : "uv pip install -e . --system";
      detected.push("uv");
    } else if (hasFile("pipfile")) {
      pm = "pipenv";
      installCmd = "pipenv install --deploy --system";
      detected.push("Pipfile (pipenv)");
    } else if (pyproj.includes("[tool.poetry]")) {
      pm = "poetry";
      installCmd = "poetry install --no-interaction --no-ansi";
      detected.push("pyproject.toml (poetry)");
    } else if (hasFile("requirements.txt")) {
      pm = "pip";
      installCmd = "pip install -r requirements.txt --no-cache-dir";
      detected.push("requirements.txt");
    } else {
      pm = "pip";
      installCmd = "pip install -e . --no-cache-dir";
      detected.push("pyproject.toml (pip)");
    }

    const py = detectPythonFramework(combined, rawFiles);
    detected.push(`framework: ${py.framework}`);

    return {
      language: "python", framework: py.framework, runtime: "python3", packageManager: pm,
      installCmd, buildCmd: null,
      startCmd: procfile?.web ?? py.startCmd,
      port: py.port, outputDir: null, dockerfile: false,
      procfile, detected, confidence: "high", appKind: py.appKind,
    };
  }

  // 4. Node.js
  if (hasNodeFiles) {
    detected.push("package.json");
    const pkg  = JSON.parse(pkgRaw || "{}");
    const deps: Record<string, string> = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}), ...(pkg?.peerDependencies ?? {}) };
    const scripts: Record<string, string> = pkg?.scripts ?? {};
    const pm = detectPackageManager(rawFiles);
    detected.push(`package-manager: ${pm}`);

    if (hasFile("tsconfig.json") || "typescript" in deps) detected.push("TypeScript");

    const node = detectNodeFramework(deps, scripts, rawFiles);
    detected.push(`framework: ${node.framework}`);

    const finalBuild = node.buildCmd ? node.buildCmd.replace(/^npm /, `${pm} `) : null;

    return {
      language: "javascript", framework: node.framework, runtime: "node", packageManager: pm,
      installCmd: pmInstall(pm),
      buildCmd: finalBuild,
      startCmd: procfile?.web ?? node.startCmd,
      port: node.port, outputDir: node.outputDir, dockerfile: false,
      procfile, detected, confidence: "high", appKind: node.appKind,
    };
  }

  // 5. Python (when no package.json at all)
  if (hasPythonFiles) {
    detected.push("Python project");
    const req      = await readText(path.join(dir, "requirements.txt"));
    const pyproj   = await readText(path.join(dir, "pyproject.toml"));
    const pipfileC = await readText(path.join(dir, "Pipfile"));
    const combined = req + "\n" + pyproj + "\n" + pipfileC;
    let pm = "pip";
    let installCmd: string | null;
    if (hasFile("uv.lock") || pyproj.includes("[tool.uv]")) {
      pm = "uv"; installCmd = "uv pip install -r requirements.txt --system"; detected.push("uv");
    } else if (hasFile("pipfile")) {
      pm = "pipenv"; installCmd = "pipenv install --deploy --system"; detected.push("Pipfile");
    } else if (pyproj.includes("[tool.poetry]")) {
      pm = "poetry"; installCmd = "poetry install --no-interaction --no-ansi"; detected.push("pyproject.toml (poetry)");
    } else {
      pm = "pip"; installCmd = hasFile("requirements.txt") ? "pip install -r requirements.txt --no-cache-dir" : "pip install -e . --no-cache-dir";
      detected.push(hasFile("requirements.txt") ? "requirements.txt" : "pyproject.toml");
    }
    const py = detectPythonFramework(combined, rawFiles);
    detected.push(`framework: ${py.framework}`);
    return {
      language: "python", framework: py.framework, runtime: "python3", packageManager: pm,
      installCmd, buildCmd: null,
      startCmd: procfile?.web ?? py.startCmd,
      port: py.port, outputDir: null, dockerfile: false,
      procfile, detected, confidence: "high", appKind: py.appKind,
    };
  }

  // 6. Ruby
  if (hasFile("Gemfile")) {
    detected.push("Gemfile (Ruby)");
    const gemContent = await readText(path.join(dir, "Gemfile"));
    const isRails   = await exists(path.join(dir, "config", "application.rb"));
    const isSinatra = gemContent.includes("sinatra");
    let framework = "ruby"; let startCmd = "ruby app.rb"; let port = 4567;
    if (isRails) { framework = "rails"; startCmd = "bundle exec rails server -b 0.0.0.0 -p $PORT"; port = 3000; detected.push("Rails"); }
    else if (isSinatra) { framework = "sinatra"; startCmd = "bundle exec ruby app.rb -o 0.0.0.0 -p $PORT"; port = 4567; detected.push("Sinatra"); }
    else { const e = ["app.rb","server.rb","main.rb","bot.rb"].find(f => hasFile(f)) ?? "app.rb"; startCmd = `bundle exec ruby ${e}`; }
    return { language: "ruby", framework, runtime: "ruby", packageManager: "bundler", installCmd: "bundle install", buildCmd: isRails ? "bundle exec rails assets:precompile" : null, startCmd: procfile?.web ?? startCmd, port, outputDir: null, dockerfile: false, procfile, detected, confidence: "high", appKind: "web" };
  }

  // 7. PHP
  if (hasFile("composer.json") || hasFile("index.php")) {
    detected.push("PHP project");
    const isLaravel = hasFile("artisan");
    const framework = isLaravel ? "laravel" : "php";
    const startCmd  = isLaravel ? "php artisan serve --host=0.0.0.0 --port=$PORT" : "php -S 0.0.0.0:$PORT";
    const port      = isLaravel ? 8000 : 8080;
    return { language: "php", framework, runtime: "php", packageManager: "composer", installCmd: hasFile("composer.json") ? "composer install --no-dev --optimize-autoloader --no-interaction" : null, buildCmd: isLaravel ? "php artisan config:cache && php artisan route:cache" : null, startCmd: procfile?.web ?? startCmd, port, outputDir: null, dockerfile: false, procfile, detected, confidence: "high", appKind: "web" };
  }

  // 8. Go
  if (hasFile("go.mod")) {
    detected.push("go.mod (Go)");
    const goMod = await readText(path.join(dir, "go.mod"));
    const mod   = goMod.match(/^module\s+(\S+)/m)?.[1] ?? "app";
    const bin   = mod.split("/").pop() ?? "app";
    return { language: "go", framework: "go", runtime: "go", packageManager: "go", installCmd: "go mod download", buildCmd: `go build -o ${bin} .`, startCmd: procfile?.web ?? `./${bin}`, port: 8080, outputDir: null, dockerfile: false, procfile, detected, confidence: "high", appKind: "web" };
  }

  // 9. Rust
  if (hasFile("Cargo.toml")) {
    detected.push("Cargo.toml (Rust)");
    const cargo = await readJson(path.join(dir, "Cargo.toml"));
    const name  = cargo?.package?.name ?? "app";
    return { language: "rust", framework: "rust", runtime: "cargo", packageManager: "cargo", installCmd: null, buildCmd: "cargo build --release", startCmd: procfile?.web ?? `./target/release/${name}`, port: 8080, outputDir: null, dockerfile: false, procfile, detected, confidence: "high", appKind: "web" };
  }

  // 10. Java (Maven)
  if (hasFile("pom.xml")) {
    detected.push("pom.xml (Maven)");
    const pomContent = await readText(path.join(dir, "pom.xml"));
    const isSpring   = pomContent.includes("spring");
    const mvnCmd     = await exists(path.join(dir, "mvnw")) ? "./mvnw" : "mvn";
    return { language: "java", framework: isSpring ? "spring-boot" : "maven", runtime: "java", packageManager: "maven", installCmd: null, buildCmd: `${mvnCmd} package -DskipTests`, startCmd: procfile?.web ?? "java -jar target/*.jar", port: 8080, outputDir: "target", dockerfile: false, procfile, detected, confidence: "high", appKind: "web" };
  }

  // 11. Java (Gradle)
  if (hasFile("build.gradle") || hasFile("build.gradle.kts")) {
    detected.push("build.gradle (Gradle)");
    const gradleCmd = await exists(path.join(dir, "gradlew")) ? "./gradlew" : "gradle";
    return { language: "java", framework: "gradle", runtime: "java", packageManager: "gradle", installCmd: null, buildCmd: `${gradleCmd} build -x test`, startCmd: procfile?.web ?? "java -jar build/libs/*.jar", port: 8080, outputDir: "build/libs", dockerfile: false, procfile, detected, confidence: "high", appKind: "web" };
  }

  // 12. Deno
  if (hasFile("deno.json") || hasFile("deno.jsonc") || hasFile("deps.ts")) {
    detected.push("Deno project");
    const denoJson = await readJson(path.join(dir, "deno.json")) ?? await readJson(path.join(dir, "deno.jsonc")) ?? {};
    const tasks = denoJson?.tasks ?? {};
    const entry = denoJson?.main ?? (hasFile("main.ts") ? "main.ts" : "mod.ts");
    return { language: "typescript", framework: "deno", runtime: "deno", packageManager: "none", installCmd: null, buildCmd: tasks.build ? "deno task build" : null, startCmd: procfile?.web ?? (tasks.start ? "deno task start" : `deno run --allow-all ${entry}`), port: 8000, outputDir: null, dockerfile: false, procfile, detected, confidence: "high", appKind: "web" };
  }

  // 13. Static HTML
  if (hasFile("index.html")) {
    detected.push("Static HTML");
    return { language: "html", framework: "static", runtime: "node", packageManager: "none", installCmd: null, buildCmd: null, startCmd: "npx serve . -l $PORT", port: 3000, outputDir: null, dockerfile: false, procfile, detected, confidence: "medium", appKind: "static" };
  }

  // 14. Unknown
  detected.push("Unknown — no recognizable project files found");
  return { language: "unknown", framework: "unknown", runtime: "node", packageManager: "none", installCmd: null, buildCmd: null, startCmd: procfile?.web ?? "node index.js", port: 3000, outputDir: null, dockerfile: false, procfile, detected, confidence: "low", appKind: "web" };
}

/** Generate a Dockerfile for the detected stack */
export function generateDockerfile(stack: StackInfo): string {
  switch (stack.language) {
    case "javascript":
    case "typescript": {
      const pm = stack.packageManager as "npm" | "pnpm" | "yarn" | "bun";
      const base = pm === "bun" ? "oven/bun:1-alpine" : "node:20-alpine";
      const pmSetup = pm === "pnpm" ? "RUN npm install -g pnpm" : pm === "bun" ? "" : "";
      const installLine = pmInstall(pm);
      return [
        `FROM ${base}`, "WORKDIR /app", pmSetup,
        "COPY package*.json ./",
        pm === "pnpm" ? "COPY pnpm-lock.yaml* ./" : pm === "yarn" ? "COPY yarn.lock* ./" : "",
        `RUN ${installLine}`, "COPY . .",
        stack.buildCmd ? `RUN ${stack.buildCmd}` : "",
        `EXPOSE ${stack.port}`, `ENV PORT=${stack.port}`,
        `CMD ${JSON.stringify(["sh", "-c", stack.startCmd])}`,
      ].filter(Boolean).join("\n");
    }
    case "python": {
      const reqLine = stack.installCmd ? `RUN ${stack.installCmd}` : "";
      return [
        "FROM python:3.12-slim", "WORKDIR /app",
        "COPY requirements*.txt pyproject.toml* Pipfile* ./",
        reqLine, "COPY . .",
        `EXPOSE ${stack.port}`, `ENV PORT=${stack.port}`,
        `CMD ["sh", "-c", "${stack.startCmd.replace(/"/g, '\\"')}"]`,
      ].filter(Boolean).join("\n");
    }
    case "ruby":
      return `FROM ruby:3.3-slim\nWORKDIR /app\nCOPY Gemfile* ./\nRUN bundle install\nCOPY . .\nEXPOSE ${stack.port}\nENV PORT=${stack.port}\nCMD ["sh","-c","${stack.startCmd}"]`;
    case "go":
      return `FROM golang:1.22-alpine AS build\nWORKDIR /app\nCOPY go.mod go.sum* ./\nRUN go mod download\nCOPY . .\nRUN ${stack.buildCmd ?? "go build -o app ."}\nFROM alpine:latest\nWORKDIR /app\nCOPY --from=build /app/app .\nEXPOSE ${stack.port}\nENV PORT=${stack.port}\nCMD ["./app"]`;
    case "rust":
      return `FROM rust:1.78 AS build\nWORKDIR /app\nCOPY . .\nRUN cargo build --release\nFROM debian:bookworm-slim\nWORKDIR /app\nCOPY --from=build /app/target/release/* .\nEXPOSE ${stack.port}\nENV PORT=${stack.port}`;
    case "php":
      return `FROM php:8.3-cli\nWORKDIR /app\nCOPY . .\nEXPOSE ${stack.port}\nENV PORT=${stack.port}\nCMD ["php","-S","0.0.0.0:${stack.port}"]`;
    case "java":
      return `FROM eclipse-temurin:21-jdk AS build\nWORKDIR /app\nCOPY . .\nRUN ${stack.buildCmd ?? "mvn package -DskipTests"}\nFROM eclipse-temurin:21-jre\nWORKDIR /app\nCOPY --from=build /app/target/*.jar app.jar\nEXPOSE ${stack.port}\nENV PORT=${stack.port}\nCMD ["java","-jar","app.jar"]`;
    default:
      return `FROM ubuntu:22.04\nWORKDIR /app\nCOPY . .\nEXPOSE 3000\nENV PORT=3000\nCMD ["sh","-c","${stack.startCmd}"]`;
  }
}
