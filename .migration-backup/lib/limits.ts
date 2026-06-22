export type LimitState = 'ok' | 'watch' | 'critical' | 'unknown';

export interface ProviderLimit {
  provider: string;
  metric: string;
  used?: number;
  limit?: number;
  remaining?: number;
  resetAt?: string;
  state: LimitState;
  note: string;
  action: string;
}

export function stateFromRemaining(remaining?: number, limit?: number): LimitState {
  if (remaining === undefined || limit === undefined || limit <= 0) return 'unknown';
  const pct = remaining / limit;
  if (pct <= 0.05) return 'critical';
  if (pct <= 0.2) return 'watch';
  return 'ok';
}

export function ethicalLimitPolicy() {
  return {
    allowed: [
      'Show real quota/limit signals from connected providers.',
      'Warn before limits are exhausted.',
      'Pause non-essential deploys when a provider is critical.',
      'Fail over to another provider/account that you legitimately own and connected yourself.',
      'Suggest upgrades or cleanup when free tiers are not enough.'
    ],
    blocked: [
      'Automatically creating new third-party accounts to bypass free-tier limits.',
      'Rotating identities, emails, cards, IPs, or accounts to evade provider restrictions.',
      'Keeping apps alive by violating provider terms of service.'
    ]
  };
}
