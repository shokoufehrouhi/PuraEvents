import AsyncStorage from '@react-native-async-storage/async-storage';

// A local record of every reminder notification that has actually fired —
// expo-notifications itself has no history API once a notification leaves
// the OS tray (getPresentedNotificationsAsync only covers what's still
// there), so this is our own ledger, written to as notifications arrive
// (see src/notifications/index.ts's listeners) and read by
// app/notification-history.tsx.
const STORAGE_KEY = 'puraevents:notificationLog';
// Unbounded growth isn't useful here (nobody needs a year of "coming up in
// 1h" entries) — kept newest-first, so this just truncates the tail.
const MAX_ENTRIES = 200;

export interface NotificationLogEntry {
  /** Same identifier scheduleNotificationAsync used — doubles as the
   *  dedupe key so a notification never gets logged twice. */
  id: string;
  eventId: string;
  title: string;
  body: string;
  /** ISO instant the notification actually fired (not when it was
   *  scheduled). */
  firedAt: string;
  /** False until the user opens notification-history.tsx (see
   *  markAllSeen) or taps the notification itself (see
   *  addNotificationResponseReceivedListener in notifications/index.ts). */
  seen: boolean;
}

async function readAll(): Promise<NotificationLogEntry[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as NotificationLogEntry[];
  } catch {
    return [];
  }
}

async function writeAll(entries: NotificationLogEntry[]): Promise<void> {
  // Newest first by when it fired — entries can arrive out of order (one
  // found later in the tray, or from the scheduled list below).
  const sorted = [...entries].sort((a, b) => b.firedAt.localeCompare(a.firedAt));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sorted.slice(0, MAX_ENTRIES)));
}

// Every read-modify-write below runs one at a time: at launch several
// notifications are logged at once, and overlapping writes would each
// save their own copy of the list, losing the others.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

// Both catch up on reminders that fired while the app was closed first
// (see logScheduledThatFired below).
export async function listNotificationLog(): Promise<NotificationLogEntry[]> {
  await logScheduledThatFired();
  return readAll();
}

export async function unseenNotificationCount(): Promise<number> {
  await logScheduledThatFired();
  return (await readAll()).filter((e) => !e.seen).length;
}

// Called from the received-listener (a live fire) and from the app-launch/
// foreground reconciliation pass (still-presented notifications that fired
// while nothing was listening, e.g. app fully closed) — either way, a
// duplicate `id` (same notification) is a no-op rather than a second row.
export function logNotificationFired(entry: Omit<NotificationLogEntry, 'seen'>, seen = false): Promise<void> {
  return serial(async () => {
    const all = await readAll();
    const index = all.findIndex((e) => e.id === entry.id);
    if (index === -1) {
      await writeAll([{ ...entry, seen }, ...all]);
    } else if (seen && !all[index].seen) {
      all[index] = { ...all[index], seen: true };
      await writeAll(all);
    }
  });
}

export function markNotificationSeen(id: string): Promise<void> {
  return serial(async () => {
    const all = await readAll();
    const index = all.findIndex((e) => e.id === id);
    if (index === -1 || all[index].seen) return;
    all[index] = { ...all[index], seen: true };
    await writeAll(all);
  });
}

export function markAllNotificationsSeen(): Promise<void> {
  return serial(async () => {
    const all = await readAll();
    if (all.every((e) => e.seen)) return;
    await writeAll(all.map((e) => ({ ...e, seen: true })));
  });
}

// --- Scheduled reminders ------------------------------------------------
// The OS keeps no record of a notification once it's swiped away, and none
// of the listeners run while the app is closed. So every reminder is also
// noted here when it's scheduled; once its time has passed it's moved into
// the log (logScheduledThatFired), whether or not the app saw it arrive.

const SCHEDULED_KEY = 'puraevents:scheduledReminders';

export interface ScheduledReminder {
  id: string;
  eventId: string;
  title: string;
  body: string;
  /** ISO instant it's due to fire. */
  fireAt: string;
}

async function readScheduled(): Promise<ScheduledReminder[]> {
  const raw = await AsyncStorage.getItem(SCHEDULED_KEY).catch(() => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Logs every noted reminder whose time has passed and forgets it. */
export function logScheduledThatFired(now = new Date()): Promise<void> {
  return serial(async () => {
    const scheduled = await readScheduled();
    const due = scheduled.filter((r) => new Date(r.fireAt) <= now);
    if (!due.length) return;
    const all = await readAll();
    const known = new Set(all.map((e) => e.id));
    const added = due
      .filter((r) => !known.has(r.id))
      .map(({ fireAt, ...rest }) => ({ ...rest, firedAt: fireAt, seen: false }));
    if (added.length) await writeAll([...added, ...all]);
    await AsyncStorage.setItem(SCHEDULED_KEY, JSON.stringify(scheduled.filter((r) => new Date(r.fireAt) > now)));
  });
}

/** Replaces the noted reminders of `eventId` (or of every event when
 *  `eventId` is null) with `next`. Ones already due are logged first, so
 *  rescheduling or deleting an event never drops a reminder that fired. */
export async function replaceScheduled(eventId: string | null, next: ScheduledReminder[]): Promise<void> {
  await logScheduledThatFired();
  await serial(async () => {
    const kept = eventId === null ? [] : (await readScheduled()).filter((r) => r.eventId !== eventId);
    await AsyncStorage.setItem(SCHEDULED_KEY, JSON.stringify([...kept, ...next]));
  });
}

/** Drops the noted reminders without logging them — after a backup
 *  restore they belong to another install and never fired here. */
export function forgetScheduled(): Promise<void> {
  return serial(() => AsyncStorage.removeItem(SCHEDULED_KEY));
}
