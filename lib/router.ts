import { BuildRecommendation, DeploymentPlan, ProviderRoute } from './types';

export function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'project';
}

export function routeProvider(rec: BuildRecommendation): ProviderRoute {
  switch (rec.framework) {
    case 'static':
    case 'react-vite':
    case 'vue':
    case 'astro':
      return {
        provider: 'cloudflare-pages',
        label: 'Cloudflare Pages',
        reason: 'Best free global CDN for static apps with automatic SSL.',
        freeTierFit: 'excellent',
        failover: ['vercel']
      };
    case 'nextjs':
      return {
        provider: 'vercel',
        label: 'Vercel Hobby',
        reason: 'Native Next.js runtime, previews and one-click rollback.',
        freeTierFit: 'excellent',
        failover: ['cloudflare-pages', 'koyeb']
      };
    case 'node-express':
    case 'python-flask':
    case 'python-fastapi':
      return {
        provider: 'koyeb',
        label: 'Koyeb Nano',
        reason: 'Free service tier suitable for APIs and long-running web services.',
        freeTierFit: 'good',
        failover: ['zeabur', 'northflank']
      };
    case 'docker':
    case 'bot':
      return {
        provider: 'bot-host',
        label: 'Free Bot/Container Host',
        reason: 'Container workload detected; use a free always-on bot/container host when available.',
        freeTierFit: 'limited',
        failover: ['koyeb', 'northflank']
      };
    default:
      return {
        provider: 'manual',
        label: 'Manual Override',
        reason: 'Project type is unknown. Choose a provider and commands manually.',
        freeTierFit: 'manual',
        failover: []
      };
  }
}

export function createPlan(projectName: string, rec: BuildRecommendation, baseDomain = process.env.NEZORA_BASE_DOMAIN ?? 'nezoradeploy.true'): DeploymentPlan {
  const slug = slugify(projectName);
  return {
    projectName,
    slug,
    url: `https://${slug}.${baseDomain}`,
    recommendation: rec,
    route: routeProvider(rec),
    env: { PORT: '8080', NODE_ENV: 'production' }
  };
}
