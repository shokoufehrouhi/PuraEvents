import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import {
  CalendarAccessLevel,
  createCalendar,
  EntityTypes,
  ExpoCalendar,
  ExpoCalendarEvent,
  Frequency,
  getCalendarPermissions,
  getCalendars,
  getDefaultCalendarSync,
  listEvents as listCalendarEvents,
  requestCalendarPermissions,
} from 'expo-calendar';
import { Platform } from 'react-native';

import { scheduleRemindersForEvent } from '../notifications';
import { applyImportedEvents, deleteEvent, listEvents, onEventsChanged } from '../storage/events';
import { loadPreferences } from '../storage/preferences';
import { getProState } from '../subscription';
import type { NewEventInput, PurEvent, RepeatRule } from '../types/event';

// Two-way sync with the phone's calendars (Pro), each direction its own
// switch in Settings → Calendar sync:
//  - export: PuraEvents' own events are written to a separate "PuraEvents"
//    calendar (created here), kept in step on every change, and that
//    calendar is deleted when export is switched off. The user's other
//    calendars are never written to.
//  - import: upcoming events (next 12 months) from the calendars the user
//    ticks come in as PuraEvents events linked back to their source
//    (PurEvent.calendarLink). The calendar stays the source of the title,
//    date, note and repeat; appearance and reminders are the user's.
// Imported events are never exported back (no loop), and deleting one in
// the app keeps it from coming back (IGNORED_KEY).

const SETTINGS_KEY = 'puraevents:calendarSync';
const EXPORT_MAP_KEY = 'puraevents:calendarExportMap';
const IGNORED_KEY = 'puraevents:calendarIgnored';
const CALENDAR_TITLE = 'PuraEvents';
const BRAND_COLOR = '#6558D9';
const IMPORT_WINDOW_DAYS = 365;

export interface CalendarSyncSettings {
  exportEnabled: boolean;
  importEnabled: boolean;
  importCalendarIds: string[];
  exportCalendarId: string | null;
  lastSyncAt: string | null;
}

const DEFAULT_SETTINGS: CalendarSyncSettings = {
  exportEnabled: false,
  importEnabled: false,
  importCalendarIds: [],
  exportCalendarId: null,
  lastSyncAt: null,
};

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key).catch(() => null);
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export function loadCalendarSettings(): Promise<CalendarSyncSettings> {
  return readJSON(SETTINGS_KEY, DEFAULT_SETTINGS);
}

export async function saveCalendarSettings(patch: Partial<CalendarSyncSettings>): Promise<CalendarSyncSettings> {
  const next = { ...(await loadCalendarSettings()), ...patch };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export async function ensureCalendarPermission(): Promise<boolean> {
  const current = await getCalendarPermissions();
  if (current.granted) return true;
  return (await requestCalendarPermissions()).granted;
}

/** Calendars the user can import from: every calendar except our own. */
export async function listImportableCalendars(): Promise<ExpoCalendar[]> {
  const settings = await loadCalendarSettings();
  const calendars = await getCalendars(EntityTypes.EVENT);
  return calendars.filter((c) => c.id !== settings.exportCalendarId && c.title !== CALENDAR_TITLE);
}

// --- Export ---------------------------------------------------------------

const FREQUENCY: Record<Exclude<RepeatRule, 'none'>, Frequency> = {
  weekly: Frequency.WEEKLY,
  monthly: Frequency.MONTHLY,
  yearly: Frequency.YEARLY,
};

async function exportCalendar(settings: CalendarSyncSettings): Promise<ExpoCalendar> {
  if (settings.exportCalendarId) {
    const existing = await ExpoCalendar.get(settings.exportCalendarId).catch(() => null);
    if (existing) return existing;
  }
  const calendar = await createCalendar({
    title: CALENDAR_TITLE,
    color: BRAND_COLOR,
    entityType: EntityTypes.EVENT,
    ...(Platform.OS === 'ios'
      ? { sourceId: getDefaultCalendarSync().source.id }
      : {
          // A local (device-only) calendar: nothing is uploaded to any account.
          source: { isLocalAccount: true, name: CALENDAR_TITLE, type: 'LOCAL' },
          name: CALENDAR_TITLE,
          ownerAccount: CALENDAR_TITLE,
          accessLevel: CalendarAccessLevel.OWNER,
        }),
  });
  await saveCalendarSettings({ exportCalendarId: calendar.id });
  return calendar;
}

function calendarDetails(event: PurEvent) {
  const start = dayjs(event.dateTimeISO);
  return {
    title: event.title,
    startDate: start.toDate(),
    endDate: start.add(1, 'hour').toDate(),
    timeZone: event.timezone,
    notes: event.note ?? '',
    // PuraEvents sends its own reminders — no second set from the calendar.
    alarms: [],
    recurrenceRule: event.repeat === 'none' ? null : { frequency: FREQUENCY[event.repeat] },
  };
}

async function runExport(settings: CalendarSyncSettings, events: PurEvent[]): Promise<void> {
  const calendar = await exportCalendar(settings);
  const map = await readJSON<Record<string, string>>(EXPORT_MAP_KEY, {});
  const next: Record<string, string> = {};
  for (const event of events.filter((e) => !e.calendarLink)) {
    const details = calendarDetails(event);
    const existing = map[event.id] ? await ExpoCalendarEvent.get(map[event.id]).catch(() => null) : null;
    if (existing) {
      await existing.update(details);
      next[event.id] = existing.id;
    } else {
      next[event.id] = (await calendar.createEvent(details)).id;
    }
  }
  // Events deleted in the app go from the calendar too.
  for (const [eventId, calendarEventId] of Object.entries(map)) {
    if (next[eventId]) continue;
    await ExpoCalendarEvent.get(calendarEventId)
      .then((e) => e.delete())
      .catch(() => {});
  }
  await AsyncStorage.setItem(EXPORT_MAP_KEY, JSON.stringify(next));
}

/** Export switched off: our calendar and everything in it goes. */
export async function removeExportCalendar(): Promise<void> {
  const settings = await loadCalendarSettings();
  if (settings.exportCalendarId) {
    const calendar = await ExpoCalendar.get(settings.exportCalendarId).catch(() => null);
    await calendar?.delete().catch(() => {});
  }
  await AsyncStorage.removeItem(EXPORT_MAP_KEY);
  await saveCalendarSettings({ exportCalendarId: null });
}

// --- Import ---------------------------------------------------------------

function repeatFor(event: ExpoCalendarEvent): RepeatRule {
  const rule = event.recurrenceRule;
  if (!rule || (rule.interval ?? 1) !== 1) return 'none';
  if (rule.frequency === Frequency.WEEKLY) return 'weekly';
  if (rule.frequency === Frequency.MONTHLY) return 'monthly';
  if (rule.frequency === Frequency.YEARLY) return 'yearly';
  return 'none';
}

async function runImport(settings: CalendarSyncSettings, events: PurEvent[], isPro: boolean): Promise<void> {
  const ignored = new Set(await readJSON<string[]>(IGNORED_KEY, []));
  const now = new Date();
  const until = dayjs().add(IMPORT_WINDOW_DAYS, 'day').toDate();
  const found = settings.importCalendarIds.length ? await listCalendarEvents(settings.importCalendarIds, now, until) : [];

  // A recurring event comes back once per occurrence — keep the next one.
  const byId = new Map<string, ExpoCalendarEvent>();
  for (const e of found) {
    const prev = byId.get(e.id);
    if (!prev || dayjs(e.startDate).isBefore(prev.startDate)) byId.set(e.id, e);
  }

  const linked = new Map(events.filter((e) => e.calendarLink).map((e) => [e.calendarLink!.eventId, e]));
  const prefs = await loadPreferences();
  const added: PurEvent[] = [];
  const replaced: PurEvent[] = [];
  const nowISO = new Date().toISOString();

  for (const source of byId.values()) {
    if (ignored.has(source.id)) continue;
    const fromCalendar = {
      title: source.title || '—',
      dateTimeISO: dayjs(source.startDate).toISOString(),
      timezone: source.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      note: source.notes || undefined,
      repeat: repeatFor(source),
      calendarLink: { calendarId: source.calendarId, eventId: source.id },
    };
    const existing = linked.get(source.id);
    if (existing) {
      const changed = (['title', 'dateTimeISO', 'note', 'repeat'] as const).some((k) => existing[k] !== fromCalendar[k]);
      if (changed) replaced.push({ ...existing, ...fromCalendar, updatedAt: nowISO });
    } else {
      const input: NewEventInput = {
        ...fromCalendar,
        category: 'other',
        accentColor: 'violet',
        cardTheme: 'color',
        reminders: prefs.defaultReminderOffsets,
      };
      added.push({ ...input, id: `cal-${source.id}-${Date.now()}`, createdAt: nowISO, updatedAt: nowISO });
    }
  }
  await applyImportedEvents(added, replaced);

  // Gone from its calendar (deleted, or its calendar was unticked), or
  // moved past the window: take it out of the app as well.
  for (const [calendarEventId, event] of linked) {
    if (!byId.has(calendarEventId) && dayjs(event.dateTimeISO).isAfter(now)) await deleteEvent(event.id);
  }

  for (const event of [...added, ...replaced]) {
    await scheduleRemindersForEvent(event, isPro, prefs.notificationsEnabled).catch(() => {});
  }
}

/** Deleting an imported event in the app keeps it from being imported again. */
export async function forgetImportedEvent(event: PurEvent): Promise<void> {
  if (!event.calendarLink) return;
  const ignored = await readJSON<string[]>(IGNORED_KEY, []);
  if (!ignored.includes(event.calendarLink.eventId)) ignored.push(event.calendarLink.eventId);
  await AsyncStorage.setItem(IGNORED_KEY, JSON.stringify(ignored));
}

// --- Running it -------------------------------------------------------------

let running: Promise<void> | null = null;
let again = false;

/** Both directions, as switched on. Pro only; a no-op without permission.
 *  Calls that arrive mid-sync are folded into one more run afterwards. */
export function syncCalendars(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      const settings = await loadCalendarSettings();
      const { isPro } = getProState();
      if (!isPro || (!settings.exportEnabled && !settings.importEnabled)) break;
      if (!(await getCalendarPermissions()).granted) break;
      if (settings.importEnabled) await runImport(settings, await listEvents(), isPro);
      if (settings.exportEnabled) await runExport(settings, await listEvents());
      await saveCalendarSettings({ lastSyncAt: new Date().toISOString() });
    } while (again);
  })()
    .catch(() => {})
    .finally(() => {
      running = null;
    });
  return running;
}

let exportTimer: ReturnType<typeof setTimeout> | null = null;

/** Keeps the PuraEvents calendar current after every add/edit/delete in
 *  the app (debounced — a save can write more than once). */
export function startCalendarSync(): void {
  onEventsChanged(() => {
    if (exportTimer) clearTimeout(exportTimer);
    exportTimer = setTimeout(() => {
      loadCalendarSettings().then((s) => {
        if (s.exportEnabled) syncCalendars();
      });
    }, 1500);
  });
}
