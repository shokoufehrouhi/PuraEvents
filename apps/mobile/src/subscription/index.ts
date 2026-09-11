import dayjs from 'dayjs';
import { useEffect, useState } from 'react';

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

// Mock expiry — far enough out to just read as "Pro" normally. Set this
// to a near-future time instead (e.g. dayjs().add(5, 'minute')) to test
// the free-tier downgrade behavior (widget freezing, etc.) live in the
// running app, no restart needed — see usePro below. Replace with real
// RevenueCat state once wired up (Phase 3 — see docs/PROJECT.md §5/§6).
const MOCK_EXPIRES_AT = dayjs().subtract(1, 'minute').toISOString();

// A hook, not a plain function — isPro needs to flip to false on its own
// once MOCK_EXPIRES_AT passes, without an app restart or code change, so
// polls the clock every 15s and re-renders whatever's watching it.
export function usePro(): SubscriptionState {
  const [now, setNow] = useState(() => dayjs());

  useEffect(() => {
    const interval = setInterval(() => setNow(dayjs()), 15_000);
    return () => clearInterval(interval);
  }, []);

  if (now.isBefore(MOCK_EXPIRES_AT)) {
    return { isPro: true, planType: 'yearly', expiresAt: MOCK_EXPIRES_AT };
  }
  return { isPro: false };
}

// Free-tier limits, mirrored from docs/PROJECT.md §6.1.
export const FREE_LIMITS = {
  maxActiveEvents: 3,
  maxWidgets: 1,
  maxRemindersPerEvent: 1,
  // Free's one reminder isn't a free choice among the presets — it's
  // fixed to "1 day before" specifically (see reminder-picker.tsx); every
  // other offset is Pro-only regardless of how many are already picked.
  freeReminderOffset: 1440,
};
