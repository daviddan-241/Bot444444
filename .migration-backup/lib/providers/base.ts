import { DeploymentPlan, DeployEvent, ProviderKey } from '../types';

export interface ProviderAdapter {
  key: ProviderKey;
  label: string;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  deploy(plan: DeploymentPlan): AsyncGenerator<DeployEvent>;
  rollback(deploymentId: string): Promise<{ ok: boolean; message: string }>;
}

export function adapterNotConnected(provider: string): never {
  throw new Error(`${provider} is not connected. Add the provider token in Settings, then use a real provider adapter.`);
}
