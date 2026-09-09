import * as Notifications from 'expo-notifications';

import type { PurEvent } from '../types/event';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

// Pre-rename (PurEvents -> PuraEvents) identifiers still floating around in
// already-scheduled notifications use the old prefix — cancelRemindersForEvent
// matches both so they still get cleaned up instead of becoming orphaned.
const LEGACY_PREFIX = 'purevents';

function identifierFor(eventId: string, offsetMin: number): string {
  return `puraevents:${eventId}:${offsetMin}`;
}

export async function cancelRemindersForEvent(eventId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const toCancel = scheduled.filter(
    (n) => n.identifier.startsWith(`puraevents:${eventId}:`) || n.identifier.startsWith(`${LEGACY_PREFIX}:${eventId}:`)
  );
  await Promise.all(toCancel.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

export async function scheduleRemindersForEvent(
  event: Pick<PurEvent, 'id' | 'title' | 'dateTimeISO' | 'reminders'>
): Promise<void> {
  await cancelRemindersForEvent(event.id);

  const eventTime = new Date(event.dateTimeISO).getTime();
  const now = Date.now();

  for (const offsetMin of event.reminders) {
    const fireAt = eventTime - offsetMin * 60_000;
    if (fireAt <= now) continue; // don't schedule reminders in the past

    await Notifications.scheduleNotificationAsync({
      identifier: identifierFor(event.id, offsetMin),
      content: {
        title: event.title,
        body: offsetMin === 0 ? "It's happening now!" : `Coming up in ${describeOffset(offsetMin)}`,
        data: { eventId: event.id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
    });
  }
}

function describeOffset(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}
