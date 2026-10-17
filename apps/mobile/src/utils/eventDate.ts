import dayjs from 'dayjs';

import type { CalendarSystem } from '../storage/preferences';
import type { RepeatRule } from '../types/event';
import { formatCivilDateFull, formatCivilDateMonthDay, formatWeekdayName, localizeDigits, shouldUseFarsiDigits } from './calendars';

// Hero card date line, format depends on how the event repeats — a
// non-repeating event needs the year to be meaningful; a yearly/monthly
// repeat happens on the same day+month (or day) every cycle so the year is
// noise; a weekly repeat is easiest to read by weekday. The weekday name is
// always shown (matching the mockup's "May 15, 2026 (Fri)" date row) since
// it's useful regardless of repeat type, not just for weekly repeats. Time
// is always shown last as HH:mm. The day/month/year and weekday name both
// follow the UI's chosen calendar system / language — see calendars.ts.
export function formatEventDateLine(
  dateTimeISO: string,
  repeat: RepeatRule,
  calendar: CalendarSystem,
  language: string,
): string {
  const time = localizeDigits(dayjs(dateTimeISO).format('HH:mm'), language);
  const useFarsiDigits = shouldUseFarsiDigits(language);
  const weekday = formatWeekdayName(dateTimeISO, language);
  // Farsi/Arabic text conventionally separates clauses with "،", not ",".
  const comma = useFarsiDigits ? '،' : ',';

  switch (repeat) {
    case 'daily':
    case 'weekdays':
    case 'weekly':
    case 'monthly':
    case 'yearly':
      return `${weekday}${comma} ${formatCivilDateMonthDay(dateTimeISO, calendar, language)} · ${time}`;
    case 'none':
    default:
      return `${weekday}${comma} ${formatCivilDateFull(dateTimeISO, calendar, language)} · ${time}`;
  }
}

// Same "weekday, full date · HH:mm" shape as the 'none'-repeat case above,
// but for *right now* rather than an event — used by the hero card's
// no-events-yet fallback (generic "Today" banner, see EventHeroCard).
export function formatTodayLine(calendar: CalendarSystem, language: string): string {
  return formatEventDateLine(new Date().toISOString(), 'none', calendar, language);
}
