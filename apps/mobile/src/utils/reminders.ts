import type { TFunction } from 'i18next';

import { FREE_LIMITS } from '../subscription';

/** Preset reminder offsets (minutes-before-event) offered in the wizard. */
export const PRESET_REMINDER_OFFSETS = [0, 60, 1440, 10080];

// Same freeze pattern as widgetAccess.ts: a saved event's `reminders` array
// is never rewritten just because Pro lapsed — only what's *active* (shown
// as on, actually scheduled) is filtered here at read time, so everything
// reappears on its own the moment Pro comes back, no re-save needed.
export function getActiveReminders(reminders: number[], isPro: boolean): number[] {
  if (isPro) return reminders;
  return reminders.filter((offset) => offset === FREE_LIMITS.freeReminderOffset);
}

export function reminderLabel(minutes: number, t: TFunction): string {
  switch (minutes) {
    case 0:
      return t('events.reminderAtTime');
    case 60:
      return t('events.reminder1Hour');
    case 1440:
      return t('events.reminder1Day');
    case 10080:
      return t('events.reminder1Week');
    default:
      return minutes < 60
        ? t('countdown.minutes', { count: minutes })
        : minutes < 1440
          ? t('countdown.hours', { count: Math.round(minutes / 60) })
          : t('countdown.days', { count: Math.round(minutes / 1440) });
  }
}
