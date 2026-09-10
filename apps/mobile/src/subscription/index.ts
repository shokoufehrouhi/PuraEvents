// Placeholder subscription state until RevenueCat is wired up (Phase 3 —
// see docs/PROJECT.md §5/§6). Temporarily hardcoded `true` per explicit
// request to test the app in Pro mode — flip back to `false` to see the
// free-tier gates again.
export function usePro(): { isPro: boolean } {
  return { isPro: true };
}

// Free-tier limits, mirrored from docs/PROJECT.md §6.1.
export const FREE_LIMITS = {
  maxActiveEvents: 3,
  maxWidgets: 1,
  maxRemindersPerEvent: 1,
};
