export const SUBSCRIPTION_TIERS = ['free', 'pro', 'team'] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const BILLING_STATUSES = ['inactive', 'trialing', 'active', 'past_due', 'canceled'] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const BILLING_INTERVALS = ['month', 'year'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export type UserEntitlements = {
  watchlistLimit: number;
  savedSearchLimit: number;
  monthlyCopilotQuestions: number | null;
  canExportReports: boolean;
  canUseSavedSearches: boolean;
  canUseWatchlist: boolean;
  canUseTeamWorkspace: boolean;
  canUseApiAccess: boolean;
};

export const PLAN_LABELS: Record<SubscriptionTier, string> = {
  free: 'Free',
  pro: 'Pro',
  team: 'Team',
};

export const PLAN_SUMMARIES: Record<SubscriptionTier, string> = {
  free: '基础检索、有限 Copilot、无个人研究资产沉淀。',
  pro: '面向个人研究者的完整工作流，含 watchlist、保存视图、导出和 API 权限。',
  team: '面向团队协作的增强版，含更高限额和团队工作区能力。',
};

export const TEAM_PLAN_SEAT_LIMIT = 5;

const ACTIVE_BILLING_STATUSES: ReadonlySet<BillingStatus> = new Set([
  'active',
  'trialing',
  'past_due',
]);

function baseEntitlementsForTier(tier: SubscriptionTier): UserEntitlements {
  if (tier === 'team') {
    return {
      watchlistLimit: 500,
      savedSearchLimit: 120,
      monthlyCopilotQuestions: 5000,
      canExportReports: true,
      canUseSavedSearches: true,
      canUseWatchlist: true,
      canUseTeamWorkspace: true,
      canUseApiAccess: true,
    };
  }
  if (tier === 'pro') {
    return {
      watchlistLimit: 100,
      savedSearchLimit: 30,
      monthlyCopilotQuestions: 800,
      canExportReports: true,
      canUseSavedSearches: true,
      canUseWatchlist: true,
      canUseTeamWorkspace: false,
      canUseApiAccess: true,
    };
  }
  return {
    watchlistLimit: 0,
    savedSearchLimit: 0,
    monthlyCopilotQuestions: 30,
    canExportReports: false,
    canUseSavedSearches: false,
    canUseWatchlist: false,
    canUseTeamWorkspace: false,
    canUseApiAccess: false,
  };
}

export function isPaidEntitlementActive(input: {
  subscription: SubscriptionTier;
  billingStatus: BillingStatus;
}): boolean {
  return input.subscription !== 'free' && ACTIVE_BILLING_STATUSES.has(input.billingStatus);
}

export function resolveEntitlements(input: {
  subscription: SubscriptionTier;
  billingStatus: BillingStatus;
}): UserEntitlements {
  if (!isPaidEntitlementActive(input)) {
    return baseEntitlementsForTier('free');
  }
  return baseEntitlementsForTier(input.subscription);
}

export function resolveTeamWorkspaceSeatLimit(input: {
  subscription: SubscriptionTier;
  billingStatus: BillingStatus;
}): number {
  return input.subscription === 'team' && isPaidEntitlementActive(input) ? TEAM_PLAN_SEAT_LIMIT : 0;
}
