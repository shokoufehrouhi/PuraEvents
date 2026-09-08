import dayjs, { type Dayjs, type ManipulateType } from 'dayjs';

import type { RepeatRule } from '../types/event';

const UNIT_BY_REPEAT: Record<Exclude<RepeatRule, 'none'>, ManipulateType> = {
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
};

/**
 * For a repeating event whose stored dateTimeISO is its first/original
 * occurrence, returns the next occurrence at or after `from` (default now).
 * Non-repeating events just return their own date, even if it's in the
 * past — the caller decides what "past" means for those.
 *
 * Without this, a weekly/monthly/yearly event whose original date has
 * already gone by shows a countdown of 0 instead of counting down to the
 * next real occurrence (see UI feedback: "Days" field showing 0).
 */
export function getNextOccurrence(dateTimeISO: string, repeat: RepeatRule, from: Dayjs = dayjs()): Dayjs {
  let occurrence = dayjs(dateTimeISO);
  if (repeat === 'none' || occurrence.isAfter(from)) return occurrence;

  const unit = UNIT_BY_REPEAT[repeat];
  // Jump forward in whole cycles first so we're not looping day-by-day for
  // an event that's years overdue, then step the rest one cycle at a time.
  const cyclesElapsed = Math.max(0, from.diff(occurrence, unit));
  if (cyclesElapsed > 0) occurrence = occurrence.add(cyclesElapsed, unit);
  while (occurrence.isBefore(from)) {
    occurrence = occurrence.add(1, unit);
  }
  return occurrence;
}

export function getNextOccurrenceISO(dateTimeISO: string, repeat: RepeatRule): string {
  return getNextOccurrence(dateTimeISO, repeat).toISOString();
}

/**
 * For a repeating event, the most recent occurrence that has already
 * happened before `from` (default now) — null if it's one-time (repeat:
 * 'none', no recurring "previous cycle" concept) or if even its first
 * occurrence hasn't happened yet. Used to surface a "this occurrence
 * happened" record in the Past tab for events that otherwise never leave
 * Upcoming (see getNextOccurrence's own doc comment) — the live event keeps
 * counting down to its next occurrence in Upcoming; this is just the
 * completed one.
 */
export function getPreviousOccurrence(dateTimeISO: string, repeat: RepeatRule, from: Dayjs = dayjs()): Dayjs | null {
  if (repeat === 'none') return null;
  const original = dayjs(dateTimeISO);
  const next = getNextOccurrence(dateTimeISO, repeat, from);
  // next === original means the first occurrence hasn't happened yet —
  // nothing has completed, so there's no previous cycle to show.
  if (!next.isAfter(original)) return null;
  return next.subtract(1, UNIT_BY_REPEAT[repeat]);
}

/**
 * Whether this event has an occurrence falling on `targetDate` (compared by
 * calendar day only, time-of-day ignored) — used by the Day view to list
 * every event scheduled for a given date, repeating or not. An event never
 * "occurs" before its own original date.
 */
export function doesEventOccurOnDate(dateTimeISO: string, repeat: RepeatRule, targetDate: Dayjs | Date): boolean {
  const start = dayjs(dateTimeISO);
  const target = dayjs(targetDate);
  if (target.isBefore(start, 'day')) return false;

  switch (repeat) {
    case 'weekly':
      return target.day() === start.day();
    case 'monthly':
      return target.date() === start.date();
    case 'yearly':
      return target.month() === start.month() && target.date() === start.date();
    case 'none':
    default:
      return target.isSame(start, 'day');
  }
}
