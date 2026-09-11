import dayjs from 'dayjs';

import { FREE_LIMITS } from '../subscription';
import type { PurEvent } from '../types/event';
import { getNextOccurrence } from './recurrence';

// Same freeze pattern as widgetAccess.ts/getActiveReminders, applied to
// events themselves: free plan can only actively *manage* (edit)
// FREE_LIMITS.maxActiveEvents events at once. Unlike widgets (ranked by
// creation order), this ranks by soonest upcoming occurrence — so the
// moment an active event's own occurrence passes (its Edit already
// freezes independently of Pro, see isPast in event/[id]/index.tsx) the
// next-soonest event rotates into the freed slot purely by recomputing
// from the current time, no stored "which slot" state to reconcile.
export function getActiveEventIds(events: PurEvent[], isPro: boolean): Set<string> {
  if (isPro) return new Set(events.map((e) => e.id));
  const upcoming = events
    .filter((e) => e.repeat !== 'none' || getNextOccurrence(e.dateTimeISO, e.repeat).isAfter(dayjs()))
    .sort(
      (a, b) => getNextOccurrence(a.dateTimeISO, a.repeat).valueOf() - getNextOccurrence(b.dateTimeISO, b.repeat).valueOf()
    );
  return new Set(upcoming.slice(0, FREE_LIMITS.maxActiveEvents).map((e) => e.id));
}

export function isEventFrozen(event: PurEvent, activeEventIds: Set<string>, isPro: boolean): boolean {
  return !isPro && !activeEventIds.has(event.id);
}
