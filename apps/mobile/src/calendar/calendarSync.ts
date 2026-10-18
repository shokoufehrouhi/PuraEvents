import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import {
  CalendarAccessLevel,
  createCalendar,
  DayOfTheWeek,
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

import { cancelRemindersForEvent, scheduleRemindersForEvent } from '../notifications';
import { applyImportedEvents, deleteEvent, listEvents, onEventsChanged, updateEvent } from '../storage/events';
import { loadPreferences } from '../storage/preferences';
import { getProState } from '../subscription';
import { getNextOccurrence, isWeekday, isWeekdaysRule, workDays } from '../utils/recurrence';
import type { NewEventInput, PurEvent, RepeatRule, WeekdaysRule } from '../types/event';

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
  /** Which calendar each ticked id was (see calendarKey): Android reuses
   *  the number of a deleted calendar for the next new one, so an id alone
   *  can come to mean a calendar the user never ticked. */
  importCalendarKeys: Record<string, string>;
  exportCalendarId: string | null;
  lastSyncAt: string | null;
}

const DEFAULT_SETTINGS: CalendarSyncSettings = {
  exportEnabled: false,
  importEnabled: false,
  importCalendarIds: [],
  importCalendarKeys: {},
  exportCalendarId: null,
  lastSyncAt: null,
};

/** A calendar's identity beyond its number: account and name. */
export function calendarKey(calendar: ExpoCalendar): string {
  return `${calendar.source?.name ?? ''}|${calendar.title}`;
}

/** Whether a ticked id still is the calendar that was ticked. Ids ticked
 *  before keys were kept can't be checked, so they count as unticked and
 *  are picked again once. */
export function isTickedCalendar(settings: CalendarSyncSettings, calendar: ExpoCalendar): boolean {
  if (!settings.importCalendarIds.includes(calendar.id)) return false;
  return settings.importCalendarKeys[calendar.id] === calendarKey(calendar);
}

// Objects are merged over the fallback (settings saved before a field
// existed); arrays come back as stored — spreading an array into an object
// would turn the ignored-events list into {0: …} and break .includes().
async function readJSON<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key).catch(() => null);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T;
    return { ...fallback, ...parsed };
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

const FREQUENCY: Record<Exclude<RepeatRule, 'none' | WeekdaysRule>, Frequency> = {
  daily: Frequency.DAILY,
  weekly: Frequency.WEEKLY,
  monthly: Frequency.MONTHLY,
  yearly: Frequency.YEARLY,
};

/** Every "PuraEvents" calendar this app made on the phone — on Android its
 *  own local account, on iOS by title. More than one is left over when the
 *  app's data was cleared (its id forgotten) and export made a new one. */
async function ownCalendars(): Promise<ExpoCalendar[]> {
  const calendars = await getCalendars(EntityTypes.EVENT).catch(() => [] as ExpoCalendar[]);
  return calendars.filter(
    (c) => c.title === CALENDAR_TITLE && (Platform.OS === 'ios' || (c.source?.name === CALENDAR_TITLE && c.source?.type === 'LOCAL')),
  );
}

async function exportCalendar(settings: CalendarSyncSettings): Promise<ExpoCalendar> {
  if (settings.exportCalendarId) {
    const existing = await ExpoCalendar.get(settings.exportCalendarId).catch(() => null);
    if (existing) {
      // Leftovers from before the app's data was cleared go too.
      for (const old of await ownCalendars()) if (old.id !== existing.id) await old.delete().catch(() => {});
      return existing;
    }
  }
  // Its id was lost (data cleared, reinstall): an earlier calendar still
  // holds copies of the events with nothing linking them, so starting
  // fresh beside it would show every event twice.
  for (const old of await ownCalendars()) await old.delete().catch(() => {});
  await AsyncStorage.removeItem(EXPORT_MAP_KEY);
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

// expo-calendar's DayOfTheWeek is 1 = Sunday … 7 = Saturday; dayjs's 0 … 6.
const toCalendarDay = (day: number): DayOfTheWeek => (day + 1) as DayOfTheWeek;
const WEEKDAYS_RULES: WeekdaysRule[] = ['weekdays', 'weekdaysSun', 'weekdaysSat'];

type CalendarDetails = ReturnType<typeof detailsAt>;

function detailsAt(event: PurEvent, start: dayjs.Dayjs, recurrenceRule: Parameters<ExpoCalendar['createEvent']>[0]['recurrenceRule']) {
  return {
    title: event.title,
    startDate: start.toDate(),
    endDate: start.add(1, 'hour').toDate(),
    timeZone: event.timezone,
    notes: event.note ?? '',
    // PuraEvents sends its own reminders — no second set from the calendar.
    alarms: [],
    recurrenceRule,
  };
}

/** The calendar events one PuraEvents event becomes, keyed by a suffix of
 *  the export map key. Weekdays is one event repeating on its 5 work days
 *  on iOS; Android's calendar API can't set the days of a weekly rule, so
 *  there it's five weekly events, one per work day. */
function calendarDetails(event: PurEvent): Record<string, CalendarDetails> {
  const start = dayjs(event.dateTimeISO);
  if (event.repeat === 'none') return { '': detailsAt(event, start, null) };
  if (!isWeekdaysRule(event.repeat)) return { '': detailsAt(event, start, { frequency: FREQUENCY[event.repeat] }) };

  const rule = event.repeat;
  const first = isWeekday(start, rule) ? start : getNextOccurrence(event.dateTimeISO, rule, start);
  if (Platform.OS === 'ios') {
    return {
      '': detailsAt(event, first, {
        frequency: Frequency.WEEKLY,
        daysOfTheWeek: workDays(rule).map((day) => ({ dayOfTheWeek: toCalendarDay(day) })),
      }),
    };
  }
  const out: Record<string, CalendarDetails> = {};
  for (let i = 0; i < 5; i++) {
    const day = getNextOccurrence(event.dateTimeISO, rule, first.add(i, 'day'));
    out[`#${day.day()}`] = detailsAt(event, day, { frequency: Frequency.WEEKLY });
  }
  return out;
}

async function runExport(settings: CalendarSyncSettings, events: PurEvent[]): Promise<void> {
  const calendar = await exportCalendar(settings);
  const map = await readJSON<Record<string, string>>(EXPORT_MAP_KEY, {});
  const next: Record<string, string> = {};
  for (const event of events.filter((e) => !e.calendarLink)) {
    for (const [suffix, details] of Object.entries(calendarDetails(event))) {
      const key = event.id + suffix;
      const existing = map[key] ? await ExpoCalendarEvent.get(map[key]).catch(() => null) : null;
      if (existing) {
        await existing.update(details);
        next[key] = existing.id;
      } else {
        next[key] = (await calendar.createEvent(details)).id;
      }
    }
  }
  // Events deleted in the app (or a repeat that now needs fewer calendar
  // events) go from the calendar too.
  for (const [key, calendarEventId] of Object.entries(map)) {
    if (next[key]) continue;
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
  for (const old of await ownCalendars()) await old.delete().catch(() => {});
  await AsyncStorage.removeItem(EXPORT_MAP_KEY);
  await saveCalendarSettings({ exportCalendarId: null });
}

// --- Import ---------------------------------------------------------------

// Google Calendar appends a fixed Meet block to every event with a video
// call (dial-in numbers, a help link, "Please do not edit this section"),
// framed by lines of "-::~:~::~…::-". It's noise in a countdown note, so
// it's replaced with just the meeting link.
const MEET_BLOCK = /-::~[:~]*::-[\s\S]*?-::~[:~]*::-/g;

export function cleanCalendarNote(note: string | undefined): string | undefined {
  if (!note) return note;
  const cleaned = note
    .replace(MEET_BLOCK, (block) => {
      const link = block.match(/https:\/\/meet\.google\.com\/[\w-]+/);
      return link ? `Google Meet: ${link[0]}` : '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || undefined;
}

function repeatFor(event: ExpoCalendarEvent): RepeatRule {
  const rule = event.recurrenceRule;
  if (!rule || (rule.interval ?? 1) !== 1) return 'none';
  if (rule.frequency === Frequency.DAILY) return 'daily';
  if (rule.frequency === Frequency.WEEKLY) {
    // Only iOS reports the days of a weekly rule. Mon–Fri, Sun–Thu and
    // Sat–Wed are the weekdays rules; any other set of several days has no
    // PuraEvents repeat.
    const days = (rule.daysOfTheWeek ?? []).map((d) => d.dayOfTheWeek).sort().join();
    if ((rule.daysOfTheWeek ?? []).length <= 1) return 'weekly';
    return WEEKDAYS_RULES.find((r) => workDays(r).map(toCalendarDay).sort().join() === days) ?? 'none';
  }
  if (rule.frequency === Frequency.MONTHLY) return 'monthly';
  if (rule.frequency === Frequency.YEARLY) return 'yearly';
  return 'none';
}

async function runImport(settings: CalendarSyncSettings, events: PurEvent[], isPro: boolean): Promise<void> {
  // Only ticked ids that still are the calendar ticked: one deleted (or
  // whose number now belongs to another calendar) drops out of the list.
  const calendars = await getCalendars(EntityTypes.EVENT);
  const valid = calendars.filter((c) => isTickedCalendar(settings, c));
  const ids = valid.map((c) => c.id);
  const keys = Object.fromEntries(valid.map((c) => [c.id, calendarKey(c)]));
  if (ids.length !== settings.importCalendarIds.length || ids.some((id) => settings.importCalendarKeys[id] !== keys[id])) {
    await saveCalendarSettings({ importCalendarIds: ids, importCalendarKeys: keys });
  }

  const ignored = new Set(await readJSON<string[]>(IGNORED_KEY, []));
  const now = new Date();
  const until = dayjs().add(IMPORT_WINDOW_DAYS, 'day').toDate();
  const found = ids.length ? await listCalendarEvents(ids, now, until) : [];

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
      note: cleanCalendarNote(source.notes || undefined),
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

/** Events imported before cleanCalendarNote existed still carry Google's
 *  Meet block; tidied once here, whether or not sync is still on. */
async function cleanImportedNotes(): Promise<void> {
  for (const event of await listEvents()) {
    if (!event.calendarLink || !event.note) continue;
    const note = cleanCalendarNote(event.note);
    if (note !== event.note) await updateEvent(event.id, { note });
  }
}

/** Every event brought in from a phone calendar goes (import switched
 *  off): they're the calendar's, not the user's, and come back when import
 *  is switched on again. */
export async function removeImportedEvents(): Promise<void> {
  for (const event of await listEvents()) {
    if (!event.calendarLink) continue;
    await cancelRemindersForEvent(event.id);
    await deleteEvent(event.id);
  }
}

/** After a backup is restored. Calendar ids are the phone's own numbering —
 *  they change when an account is added or removed, and differ on another
 *  phone — so a restored selection can point at calendars the user never
 *  picked. Sync starts over instead: import off with nothing ticked and its
 *  events gone, and export making its calendar afresh (leftovers of the old
 *  one are cleaned up by exportCalendar). */
export async function resetCalendarSyncAfterRestore(): Promise<void> {
  await removeImportedEvents();
  await saveCalendarSettings({ importEnabled: false, importCalendarIds: [], importCalendarKeys: {}, exportCalendarId: null, lastSyncAt: null });
  await AsyncStorage.multiRemove([EXPORT_MAP_KEY, IGNORED_KEY]);
}

/** Turning import back on starts over: events deleted in the app before
 *  come in again on the next sync. */
export async function forgetDeletedImports(): Promise<void> {
  await AsyncStorage.removeItem(IGNORED_KEY);
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
  cleanImportedNotes().catch(() => {});
  // Import off means no imported events — e.g. ones a restored backup
  // brought back while import is off.
  loadCalendarSettings()
    .then((s) => (s.importEnabled ? undefined : removeImportedEvents()))
    .catch(() => {});
  onEventsChanged(() => {
    if (exportTimer) clearTimeout(exportTimer);
    exportTimer = setTimeout(() => {
      loadCalendarSettings().then((s) => {
        if (s.exportEnabled) syncCalendars();
      });
    }, 1500);
  });
}
