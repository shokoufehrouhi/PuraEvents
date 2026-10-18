import dayjs, { type Dayjs, type ManipulateType } from 'dayjs';

import type { RepeatRule, WeekdaysRule } from '../types/event';

const UNIT_BY_REPEAT: Record<Exclude<RepeatRule, 'none' | WeekdaysRule>, ManipulateType> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
};

/** First day (dayjs: 0 = Sunday) of each work week rule. */
const WORK_WEEK_START: Record<WeekdaysRule, number> = { weekdays: 1, weekdaysSun: 0, weekdaysSat: 6 };

export function isWeekdaysRule(repeat: RepeatRule): repeat is WeekdaysRule {
  return repeat in WORK_WEEK_START;
}

/** The weekdays rule whose work week starts on Preferences > First day of
 *  week (Monday → Mon–Fri, Sunday → Sun–Thu, Saturday → Sat–Wed). */
export function weekdaysRuleFor(firstDayOfWeek: number): WeekdaysRule {
  return firstDayOfWeek === 0 ? 'weekdaysSun' : firstDayOfWeek === 6 ? 'weekdaysSat' : 'weekdays';
}

/** The 5 work days of a weekdays rule, as dayjs days (0 = Sunday). */
export function workDays(rule: WeekdaysRule): number[] {
  return [0, 1, 2, 3, 4].map((i) => (WORK_WEEK_START[rule] + i) % 7);
}

/** Whether `date` is one of the rule's 5 work days (Mon–Fri by default). */
export function isWeekday(date: Dayjs, rule: WeekdaysRule = 'weekdays'): boolean {
  return (date.day() - WORK_WEEK_START[rule] + 7) % 7 < 5;
}

/** The occurrence after `at` (same time of day). */
export function stepOccurrence(at: Dayjs, repeat: Exclude<RepeatRule, 'none'>): Dayjs {
  if (!isWeekdaysRule(repeat)) return at.add(1, UNIT_BY_REPEAT[repeat]);
  let next = at.add(1, 'day');
  while (!isWeekday(next, repeat)) next = next.add(1, 'day');
  return next;
}

/** The occurrence before `at` (same time of day). */
function stepBack(at: Dayjs, repeat: Exclude<RepeatRule, 'none'>): Dayjs {
  if (!isWeekdaysRule(repeat)) return at.subtract(1, UNIT_BY_REPEAT[repeat]);
  let prev = at.subtract(1, 'day');
  while (!isWeekday(prev, repeat)) prev = prev.subtract(1, 'day');
  return prev;
}

/** The first real occurrence: the stored date itself, except a weekdays
 *  event saved on a day off, which starts on the next work day. */
function firstOccurrence(dateTimeISO: string, repeat: RepeatRule): Dayjs {
  const start = dayjs(dateTimeISO);
  return isWeekdaysRule(repeat) && !isWeekday(start, repeat) ? stepOccurrence(start, repeat) : start;
}

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
  let occurrence = firstOccurrence(dateTimeISO, repeat);
  if (repeat === 'none' || occurrence.isAfter(from)) return occurrence;

  // Jump forward in whole cycles first so we're not looping one cycle at a
  // time for an event that's years overdue, then step the rest. Weekdays
  // jumps by whole days and lets stepOccurrence skip the weekends.
  const unit = isWeekdaysRule(repeat) ? 'day' : UNIT_BY_REPEAT[repeat];
  const cyclesElapsed = Math.max(0, from.diff(occurrence, unit));
  if (cyclesElapsed > 0) occurrence = occurrence.add(cyclesElapsed, unit);
  if (isWeekdaysRule(repeat) && !isWeekday(occurrence, repeat)) occurrence = stepOccurrence(occurrence, repeat);
  while (occurrence.isBefore(from)) {
    occurrence = stepOccurrence(occurrence, repeat);
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
  const first = firstOccurrence(dateTimeISO, repeat);
  const next = getNextOccurrence(dateTimeISO, repeat, from);
  // next === first means the first occurrence hasn't happened yet —
  // nothing has completed, so there's no previous cycle to show.
  if (!next.isAfter(first)) return null;
  return stepBack(next, repeat);
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
    case 'daily':
      return true;
    case 'weekdays':
    case 'weekdaysSun':
    case 'weekdaysSat':
      return isWeekday(target, repeat);
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
