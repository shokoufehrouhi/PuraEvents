import dayjs, { type Dayjs } from 'dayjs';

import type { NotificationLogEntry } from '../storage/notificationLog';
import type { EventCategory, PurEvent } from '../types/event';
import { getNextOccurrence, stepOccurrence } from './recurrence';
import { getActiveReminders } from './reminders';

// Numbers for the Overview tab, all computed from what's on the device —
// no server, nothing leaves the phone.

export interface UpcomingItem {
  event: PurEvent;
  at: Dayjs;
}

export type TimelineGroup = 'today' | 'thisWeek' | 'nextWeek' | 'later';

export interface OverviewData {
  upcoming: UpcomingItem[];
  next7Days: number;
  next30Days: number;
  timeline: { group: TimelineGroup; items: UpcomingItem[] }[];
  byCategory: { category: EventCategory; count: number }[];
  pastCounts: { months3: number; months6: number; months12: number };
  /** The last 6 months, oldest first. */
  perMonth: { month: Dayjs; count: number }[];
  remindersNext7Days: number;
  notificationsLast30Days: number;
}

const CATEGORIES: EventCategory[] = ['personal', 'work', 'travel', 'finance', 'health', 'other'];

/** Every time the event happened (or happens) within [from, to). */
function occurrencesBetween(event: PurEvent, from: Dayjs, to: Dayjs): Dayjs[] {
  const first = dayjs(event.dateTimeISO);
  if (event.repeat === 'none') return !first.isBefore(from) && first.isBefore(to) ? [first] : [];
  const out: Dayjs[] = [];
  let at = getNextOccurrence(event.dateTimeISO, event.repeat, first.isBefore(from) ? from : first);
  while (at.isBefore(to)) {
    out.push(at);
    at = stepOccurrence(at, event.repeat);
  }
  return out;
}

function timelineGroup(at: Dayjs, now: Dayjs): TimelineGroup {
  const days = at.startOf('day').diff(now.startOf('day'), 'day');
  if (days <= 0) return 'today';
  if (days < 7) return 'thisWeek';
  if (days < 14) return 'nextWeek';
  return 'later';
}

export function computeOverview(
  events: PurEvent[],
  log: NotificationLogEntry[],
  isPro: boolean,
  now: Dayjs = dayjs(),
): OverviewData {
  const upcoming = events
    .map((event) => ({ event, at: getNextOccurrence(event.dateTimeISO, event.repeat, now) }))
    .filter(({ at }) => at.isAfter(now))
    .sort((a, b) => a.at.valueOf() - b.at.valueOf());

  const in7 = now.add(7, 'day');
  const in30 = now.add(30, 'day');
  const within30 = upcoming.filter(({ at }) => at.isBefore(in30));

  const groups: TimelineGroup[] = ['today', 'thisWeek', 'nextWeek', 'later'];
  const timeline = groups
    .map((group) => ({ group, items: within30.filter(({ at }) => timelineGroup(at, now) === group) }))
    .filter(({ items }) => items.length > 0);

  const byCategory = CATEGORIES.map((category) => ({
    category,
    count: upcoming.filter(({ event }) => event.category === category).length,
  })).filter(({ count }) => count > 0);

  const pastSince = (months: number) =>
    events.reduce((sum, e) => sum + occurrencesBetween(e, now.subtract(months, 'month'), now).length, 0);

  const perMonth = Array.from({ length: 6 }, (_, i) => {
    const month = now.subtract(5 - i, 'month').startOf('month');
    const end = i === 5 ? now : month.add(1, 'month');
    return { month, count: events.reduce((sum, e) => sum + occurrencesBetween(e, month, end).length, 0) };
  });

  // Reminders that will actually fire in the next 7 days — the plan's
  // active offsets, before each event's next occurrence.
  const remindersNext7Days = upcoming.reduce((sum, { event, at }) => {
    const fires = getActiveReminders(event.reminders, isPro)
      .map((offset) => at.subtract(offset, 'minute'))
      .filter((fireAt) => fireAt.isAfter(now) && fireAt.isBefore(in7));
    return sum + fires.length;
  }, 0);

  const since30 = now.subtract(30, 'day');
  const notificationsLast30Days = log.filter((entry) => dayjs(entry.firedAt).isAfter(since30)).length;

  return {
    upcoming,
    next7Days: upcoming.filter(({ at }) => at.isBefore(in7)).length,
    next30Days: within30.length,
    timeline,
    byCategory,
    pastCounts: { months3: pastSince(3), months6: pastSince(6), months12: pastSince(12) },
    perMonth,
    remindersNext7Days,
    notificationsLast30Days,
  };
}
