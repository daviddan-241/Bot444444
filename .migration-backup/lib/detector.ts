import { BuildRecommendation, DetectionInput, Framework } from './types';

const has = (files: string[], pattern: RegExp) => files.some((file) => pattern.test(file));
const dep = (pkg: Record<string, unknown> | undefined, name: string) => {
  const dependencies = (pkg?.dependencies ?? {}) as Record<string, string>;
  const devDependencies = (pkg?.devDependencies ?? {}) as Record<string, string>;
  return Boolean(dependencies[name] || devDependencies[name]);
};
const script = (pkg: Record<string, unknown> | undefined, name: string) => {
  const scripts = (pkg?.scripts ?? {}) as Record<string, string>;
  return scripts[name];
};

export function detectProject(input: DetectionInput): BuildRecommendation {
  const files = input.files.map((f) => f.replace(/^\.\//, ''));
  const pkg = input.packageJson;
  const req = input.requirementsTxt?.toLowerCase() ?? '';
  const notes: string[] = [];
  let framework: Framework = 'unknown';
  let confidence = 0.45;
  let installCommand = 'npm install';
  let buildCommand = 'npm run build';
  let startCommand = 'npm start';
  let outputDirectory = 'dist';
  let runtime: BuildRecommendation['runtime'] = 'nodejs20';

  if (input.dockerfile || has(files, /^Dockerfile$/i) || has(files, /docker-compose\.ya?ml$/i)) {
    framework = 'docker';
    confidence = 0.96;
    installCommand = 'docker build';
    buildCommand = 'docker build -t nezora-app .';
    startCommand = 'docker run -p $PORT:$PORT nezora-app';
    outputDirectory = '/';
    runtime = 'docker';
    notes.push('Dockerfile found. Nezora will deploy this as a container workload.');
  } else if (dep(pkg, 'next') || has(files, /^next\.config\.(mjs|js|ts)$/)) {
    framework = 'nextjs';
    confidence = 0.94;
    installCommand = has(files, /pnpm-lock\.yaml$/) ? 'pnpm install --frozen-lockfile' : has(files, /yarn\.lock$/) ? 'yarn install --frozen-lockfile' : 'npm ci';
    buildCommand = script(pkg, 'build') ? 'npm run build' : 'next build';
    startCommand = script(pkg, 'start') ? 'npm start' : 'next start -p $PORT';
    outputDirectory = '.next';
    runtime = 'nodejs20';
    notes.push('Next.js supports SSR, API routes and static assets. Vercel Hobby is the first recommendation.');
  } else if (dep(pkg, 'vite') && dep(pkg, 'react')) {
    framework = 'react-vite';
    confidence = 0.92;
    installCommand = has(files, /pnpm-lock\.yaml$/) ? 'pnpm install --frozen-lockfile' : 'npm ci';
    buildCommand = script(pkg, 'build') ? 'npm run build' : 'vite build';
    startCommand = 'n/a — served as static assets';
    outputDirectory = 'dist';
    runtime = 'static';
    notes.push('React + Vite detected. Cloudflare Pages gives fast static hosting with free HTTPS.');
  } else if (dep(pkg, 'vue')) {
    framework = 'vue';
    confidence = 0.86;
    buildCommand = script(pkg, 'build') ? 'npm run build' : 'vite build';
    startCommand = 'n/a — served as static assets';
    outputDirectory = 'dist';
    runtime = 'static';
  } else if (dep(pkg, 'astro')) {
    framework = 'astro';
    confidence = 0.88;
    buildCommand = script(pkg, 'build') ? 'npm run build' : 'astro build';
    startCommand = 'n/a — served as static assets';
    outputDirectory = 'dist';
    runtime = 'static';
  } else if (dep(pkg, 'express') || has(files, /(server|app|index)\.(js|ts)$/)) {
    framework = 'node-express';
    confidence = dep(pkg, 'express') ? 0.89 : 0.66;
    installCommand = has(files, /pnpm-lock\.yaml$/) ? 'pnpm install --frozen-lockfile' : 'npm ci';
    buildCommand = script(pkg, 'build') ? 'npm run build' : 'echo "No build required"';
    startCommand = script(pkg, 'start') ? 'npm start' : 'node index.js';
    outputDirectory = '.';
    runtime = 'nodejs20';
    notes.push('Long-running Node service detected. Nezora will set PORT automatically.');
  } else if (req.includes('fastapi') || has(files, /(main|app)\.py$/)) {
    framework = req.includes('fastapi') ? 'python-fastapi' : req.includes('flask') ? 'python-flask' : 'python-fastapi';
    confidence = req.includes('fastapi') || req.includes('flask') ? 0.88 : 0.62;
    installCommand = 'pip install -r requirements.txt';
    buildCommand = 'echo "No build required"';
    startCommand = framework === 'python-flask' ? 'gunicorn app:app --bind 0.0.0.0:$PORT' : 'uvicorn main:app --host 0.0.0.0 --port $PORT';
    outputDirectory = '.';
    runtime = 'python3.12';
  } else if (has(files, /(^|\/)index\.html$/)) {
    framework = 'static';
    confidence = 0.84;
    installCommand = 'n/a';
    buildCommand = 'n/a';
    startCommand = 'n/a — served as static assets';
    outputDirectory = has(files, /^public\//) ? 'public' : '.';
    runtime = 'static';
    notes.push('Plain static website detected. No build step required.');
  } else {
    notes.push('Nezora could not confidently identify this project. Use manual override or Docker.');
  }

  return { framework, confidence, installCommand, buildCommand, startCommand, outputDirectory, runtime, notes };
}
