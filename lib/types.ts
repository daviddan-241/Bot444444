export type Framework =
  | 'static'
  | 'react-vite'
  | 'nextjs'
  | 'vue'
  | 'astro'
  | 'node-express'
  | 'python-flask'
  | 'python-fastapi'
  | 'docker'
  | 'bot'
  | 'unknown';

export type ProviderKey = 'cloudflare-pages' | 'vercel' | 'koyeb' | 'zeabur' | 'northflank' | 'bot-host' | 'manual';

export type Runtime = 'static' | 'nodejs20' | 'python3.12' | 'docker' | 'custom';

export interface DetectionInput {
  files: string[];
  packageJson?: Record<string, unknown>;
  requirementsTxt?: string;
  dockerfile?: string;
}

export interface BuildRecommendation {
  framework: Framework;
  confidence: number;
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  outputDirectory: string;
  runtime: Runtime;
  notes: string[];
}

export interface ProviderRoute {
  provider: ProviderKey;
  label: string;
  reason: string;
  freeTierFit: 'excellent' | 'good' | 'limited' | 'manual';
  failover: ProviderKey[];
}

export interface DeploymentPlan {
  projectName: string;
  slug: string;
  url: string;
  recommendation: BuildRecommendation;
  route: ProviderRoute;
  env: Record<string, string>;
}

export interface ProviderConnection {
  key: ProviderKey;
  label: string;
  connected: boolean;
  status: 'healthy' | 'warning' | 'disconnected';
  limitText: string;
}

export interface DeployEvent {
  id: string;
  ts: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}
