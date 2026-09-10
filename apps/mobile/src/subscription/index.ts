// The 3 IAP products PROJECT.md §5/§6 specs (monthly/yearly auto-renewing,
// plus a one-time Lifetime purchase) — 'lifetime' never has an expiresAt.
export type PlanType = 'monthly' | 'yearly' | 'lifetime';

export interface SubscriptionState {
  isPro: boolean;
  planType?: PlanType;
  // ISO date the current plan renews (monthly/yearly) — undefined for
  // 'lifetime' (never expires) and whenever isPro is false.
  expiresAt?: string;
}

// Placeholder subscription state until RevenueCat is wired up (Phase 3 —
// see docs/PROJECT.md §5/§6). Temporarily hardcoded to a Pro/yearly plan
// per explicit request to test the app in Pro mode — flip isPro back to
// `false` (and clear planType/expiresAt) to see the free-tier gates again.
export function usePro(): SubscriptionState {
  return {
    isPro: true,
    planType: 'yearly',
    expiresAt: '2027-09-10T00:00:00.000Z',
  };
}

// Free-tier limits, mirrored from docs/PROJECT.md §6.1.
export const FREE_LIMITS = {
  maxActiveEvents: 3,
  maxWidgets: 1,
  maxRemindersPerEvent: 1,
};
