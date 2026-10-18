import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import i18n from '../i18n';
import { accents } from '../theme/tokens';
import { listEvents } from '../storage/events';
import { logNotificationFired, logScheduledThatFired, replaceScheduled, type ScheduledReminder } from '../storage/notificationLog';
import type { NotificationSoundKey, PurEvent } from '../types/event';
import { localizeDigits } from '../utils/calendars';
import { getNextOccurrence, stepOccurrence } from '../utils/recurrence';
import { getActiveReminders } from '../utils/reminders';

// Filenames as bundled via the expo-notifications config plugin's own
// `sounds` list in app.json — that plugin copies each one into the iOS app
// bundle and Android's res/raw (by basename) at prebuild time, so these
// strings must match exactly. 'default'/unset isn't listed here; those
// cases pass `sound: true` (OS default) straight through instead.
export const NOTIFICATION_SOUND_FILES: Record<Exclude<NotificationSoundKey, 'default'>, string> = {
  chime: 'chime.wav',
  bell: 'bell.wav',
  ping: 'ping.wav',
  pulse: 'pulse.wav',
};

// Android 8+ ignores a per-notification sound entirely — the *channel* a
// notification is posted to controls it instead, and a channel's sound
// can't be changed after creation (Android OS limitation, see
// setNotificationChannelAsync's own doc comment). So: one fixed, never-
// mutated channel per sound key, created (idempotently) the first time
// it's needed, and referenced by trigger.channelId below. iOS has no
// concept of channels — content.sound alone is enough there.
const ensuredChannels = new Set<string>();

function channelIdFor(sound: Exclude<NotificationSoundKey, 'default'>): string {
  return `puraevents-${sound}`;
}

async function ensureAndroidChannel(sound: Exclude<NotificationSoundKey, 'default'>): Promise<string> {
  const channelId = channelIdFor(sound);
  if (Platform.OS === 'android' && !ensuredChannels.has(channelId)) {
    // Resource name, not the filename — Android's raw resources are
    // referenced without their extension (see the config plugin's own
    // ANDROID_RES_PATH/raw copy step).
    await Notifications.setNotificationChannelAsync(channelId, {
      name: `${sound.charAt(0).toUpperCase()}${sound.slice(1)} reminders`,
      importance: Notifications.AndroidImportance.HIGH,
      sound,
    });
    ensuredChannels.add(channelId);
  }
  return channelId;
}

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

// Shared by the log (below) and app/_layout.tsx's own tap popup — both
// need the same fields off the same raw Notification shape.
export interface NotificationInfo {
  id: string;
  eventId: string;
  title: string;
  body: string;
  firedAt: string;
}

export function extractNotificationInfo(notification: Notifications.Notification): NotificationInfo {
  const data = notification.request.content.data as { eventId?: string } | undefined;
  // notification.date isn't consistently epoch milliseconds — a remote/
  // simulated push (iOS's own NSDate is seconds-based) comes through as
  // epoch *seconds*, while a locally-scheduled one comes through as epoch
  // milliseconds, and there's no field saying which. Below ~1e12 can't be
  // a real millisecond timestamp (that threshold is itself the year 2001),
  // so treat anything smaller as seconds and scale it up.
  const rawDate = notification.date;
  const firedAtMs = rawDate < 1e12 ? rawDate * 1000 : rawDate;
  return {
    id: notification.request.identifier,
    eventId: data?.eventId ?? '',
    title: notification.request.content.title ?? '',
    body: notification.request.content.body ?? '',
    firedAt: new Date(firedAtMs).toISOString(),
  };
}

function logFromNotification(notification: Notifications.Notification): void {
  logNotificationFired(extractNotificationInfo(notification));
}

// Called once from app/_layout.tsx — expo-notifications keeps no history of
// its own once a notification leaves the OS tray, so this is what actually
// builds the log app/notification-history.tsx reads:
//  - a live "received" event (app process alive when it fires) gets logged
//    immediately, unseen.
//  - opening/tapping the notification marks that same entry seen.
//  - on top of both, a one-time reconciliation pass against whatever's
//    still sitting in the OS tray right now catches anything that fired
//    while the app was fully closed and neither listener could run —
//    logNotificationFired's own id-dedupe means this never double-logs
//    one the received-listener already caught.
export function initNotificationLogListeners(): () => void {
  const receivedSub = Notifications.addNotificationReceivedListener(logFromNotification);
  // A tap logs it too (already seen). The one that launched a closed app
  // is logged by app/_layout.tsx, which also clears it.
  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    logNotificationFired(extractNotificationInfo(response.notification), true);
  });

  Notifications.getPresentedNotificationsAsync().then((presented) => {
    presented.forEach(logFromNotification);
  });
  // Anything else that fired while the app was closed and was swiped away.
  logScheduledThatFired();

  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}

// Pre-rename (PurEvents -> PuraEvents) identifiers still floating around in
// already-scheduled notifications use the old prefix — cancelRemindersForEvent
// matches both so they still get cleaned up instead of becoming orphaned.
const LEGACY_PREFIX = 'purevents';

// A repeating event has a reminder per occurrence, so the occurrence's
// time is part of the id (also what the notification log dedupes on).
function identifierFor(eventId: string, offsetMin: number, occurrence: number): string {
  return `puraevents:${eventId}:${offsetMin}:${occurrence}`;
}

// How far ahead a repeating event's reminders are scheduled, and at most
// how many per reminder offset. The rest are scheduled as the app is
// opened again (see refreshRepeatingReminders) — iOS keeps only 64
// pending notifications per app, so a daily event can't book months ahead.
const REPEAT_HORIZON_DAYS = 14;
const MAX_PER_OFFSET = 3;

/** When a reminder offset fires: once for a one-time event, before each of
 *  the next few occurrences of a repeating one. */
function reminderTimes(
  event: Pick<PurEvent, 'dateTimeISO' | 'repeat'>,
  offsetMin: number,
  now: number
): { fireAt: number; occurrence: number }[] {
  const offsetMs = offsetMin * 60_000;
  if (event.repeat === 'none') {
    const occurrence = new Date(event.dateTimeISO).getTime();
    return [{ fireAt: occurrence - offsetMs, occurrence }];
  }
  const out: { fireAt: number; occurrence: number }[] = [];
  const horizon = now + REPEAT_HORIZON_DAYS * 86_400_000;
  // The first occurrence whose reminder is still ahead.
  let at = getNextOccurrence(event.dateTimeISO, event.repeat, dayjs(now + offsetMs));
  while (out.length < MAX_PER_OFFSET && at.valueOf() - offsetMs <= horizon) {
    out.push({ fireAt: at.valueOf() - offsetMs, occurrence: at.valueOf() });
    at = stepOccurrence(at, event.repeat);
  }
  return out;
}

export async function cancelRemindersForEvent(eventId: string): Promise<void> {
  await replaceScheduled(eventId, []);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const toCancel = scheduled.filter(
    (n) => n.identifier.startsWith(`puraevents:${eventId}:`) || n.identifier.startsWith(`${LEGACY_PREFIX}:${eventId}:`)
  );
  await Promise.all(toCancel.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

// isPro is required, not optional — on free plan only FREE_LIMITS.
// freeReminderOffset ("1 day before") actually gets scheduled, same offsets
// the detail screen shows as active (see getActiveReminders); the rest stay
// in event.reminders untouched so they come back the moment Pro does.
//
// notificationsEnabled mirrors the Settings > Notifications toggle
// (prefs.notificationsEnabled) — passed explicitly by the caller (which
// already has it via usePreferences) rather than read from storage in
// here, so there's no race against a setPrefs() that hasn't finished its
// own (unawaited) save yet. Always cancels this event's existing reminders
// first regardless, so flipping the toggle off and saving/reopening an
// event actually clears them instead of leaving stale ones scheduled.
export async function scheduleRemindersForEvent(
  event: Pick<PurEvent, 'id' | 'title' | 'dateTimeISO' | 'repeat' | 'reminders' | 'note' | 'notificationSound' | 'accentColor'>,
  isPro: boolean,
  notificationsEnabled: boolean
): Promise<void> {
  await cancelRemindersForEvent(event.id);
  if (!notificationsEnabled) return;
  // Reminders only reach the history when they can actually show.
  const canShow = (await Notifications.getPermissionsAsync()).granted;
  const noted: ScheduledReminder[] = [];

  const now = Date.now();
  const activeReminders = getActiveReminders(event.reminders, isPro);

  const sound = event.notificationSound;
  const isCustomSound = sound && sound !== 'default';
  // Android-only — ensures the fixed per-sound channel exists (creating it
  // the first time, no-op after) before anything tries to schedule into
  // it. Skipped entirely for 'default'/unset (uses the OS default channel/
  // sound instead, see content.sound below).
  const channelId = isCustomSound ? await ensureAndroidChannel(sound) : undefined;

  for (const offsetMin of activeReminders) {
    for (const { fireAt, occurrence } of reminderTimes(event, offsetMin, now)) {
      if (fireAt <= now) continue; // don't schedule reminders in the past

      // Always auto-generated, never manually typed — title is just the
      // event's own name, and the body leads with the note (when there is
      // one) followed by how much time is actually left, so a reminder
      // reads like "Don't forget the passport — coming up in 2h" instead of
      // needing the user to retype that same info as a separate message.
      const timeLine =
        offsetMin === 0 ? i18n.t('notification.happeningNow') : i18n.t('notification.comingUpIn', { time: describeOffset(offsetMin) });
      const body = event.note?.trim() ? `${event.note.trim()} — ${timeLine}` : timeLine;

      await Notifications.scheduleNotificationAsync({
        identifier: identifierFor(event.id, offsetMin, occurrence),
        content: {
          title: event.title,
          body,
          data: { eventId: event.id },
          // Filename (with extension) on iOS / pre-8 Android; the fixed
          // channel above is what actually controls it on Android 8+ (see
          // ensureAndroidChannel's own comment).
          sound: isCustomSound ? NOTIFICATION_SOUND_FILES[sound] : true,
          // Android: the notification is tinted with the event's own accent
          // color (the small icon and app name), so each event's reminders
          // are recognizable at a glance. iOS ignores it.
          color: accents[event.accentColor] ?? accents.violet,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(fireAt), channelId },
      });
      noted.push({
        id: identifierFor(event.id, offsetMin, occurrence),
        eventId: event.id,
        title: event.title,
        body,
        fireAt: new Date(fireAt).toISOString(),
      });
    }
  }
  if (canShow) await replaceScheduled(event.id, noted);
}

// Called from notification-settings.tsx's own toggle — scheduleRemindersForEvent
// above only touches one event's reminders, and only the next time it's
// saved/reopened, so flipping the global switch needs its own immediate
// sweep instead of waiting for that to happen naturally:
//  - turning it off cancels every reminder scheduled by this app outright
//    (nothing else schedules local notifications here, so a blanket
//    cancelAllScheduledNotificationsAsync is safe, not just "this app's
//    puraevents:-prefixed ones").
//  - turning it back on re-schedules every event's reminders from
//    scratch, same as a fresh save would.
export async function applyNotificationsEnabledChange(enabled: boolean, isPro: boolean): Promise<void> {
  if (!enabled) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await replaceScheduled(null, []);
    return;
  }
  const events = await listEvents();
  await Promise.all(events.map((event) => scheduleRemindersForEvent(event, isPro, true)));
}

// A repeating event only has its next few reminders scheduled (see
// reminderTimes), so they're topped up whenever the app comes to the
// foreground.
export async function refreshRepeatingReminders(isPro: boolean, notificationsEnabled: boolean): Promise<void> {
  if (!notificationsEnabled) return;
  const events = await listEvents();
  await Promise.all(events.filter((e) => e.repeat !== 'none').map((event) => scheduleRemindersForEvent(event, isPro, true)));
}

const REMINDER_LANGUAGE_KEY = 'puraevents:reminderLanguage';

// Run at launch and whenever the app language changes. Schedules every
// event's reminders again when:
//  - nothing is scheduled at all: scheduled notifications live in the OS,
//    not in the app's data, so after Android restores a backup (reinstall
//    / new phone) the events come back with no reminders scheduled;
//  - the language changed: a reminder's text is fixed when it's scheduled.
// A no-op for events whose reminders are all in the past.
export async function restoreMissingReminders(isPro: boolean, notificationsEnabled: boolean): Promise<void> {
  if (!notificationsEnabled) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const hasAny = scheduled.some((n) => n.identifier.startsWith('puraevents:'));
  const scheduledIn = await AsyncStorage.getItem(REMINDER_LANGUAGE_KEY).catch(() => null);
  if (hasAny && scheduledIn === i18n.language) return;
  const events = await listEvents();
  await Promise.all(events.map((event) => scheduleRemindersForEvent(event, isPro, true)));
  await AsyncStorage.setItem(REMINDER_LANGUAGE_KEY, i18n.language).catch(() => {});
}

// Also used by app/_layout.tsx's tap popup, to show how much is left until
// the event *now* (not the offset the reminder itself fired for) in the
// same terse "2h"/"3d" shape the notification body already uses.
export function describeOffset(minutes: number): string {
  const [key, count] =
    minutes < 60 ? ['countdown.minutes', minutes] : minutes < 1440 ? ['countdown.hours', Math.round(minutes / 60)] : ['countdown.days', Math.round(minutes / 1440)];
  return localizeDigits(i18n.t(key, { count }), i18n.language);
}
