import dayjs from 'dayjs';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { TFunction } from 'i18next';
import * as XLSX from 'xlsx';

import { saveToDownloads } from '../../modules/save-to-downloads';
import { ACCENT_KEYS, type AccentKey } from '../theme/tokens';
import type { CardTheme, EventCategory, NotificationSoundKey, PurEvent, RepeatRule } from '../types/event';
import { getNextOccurrenceISO } from './recurrence';
import { reminderLabel } from './reminders';

// Export/import of the user's events (Settings → Data & Privacy).
//
// Two export formats, picked by the user each time:
//  - JSON: the full backup — every field, round-trips through Import.
//  - Excel (.xlsx): a readable spreadsheet of the events in the user's
//    language. It also carries the same JSON payload in a hidden sheet, so
//    an Excel export can be imported back too.
// Import never asks for a format — it's read off the picked file itself.

export type ExportFormat = 'json' | 'xlsx';

const APP_ID = 'PuraEvents';
const EXPORT_VERSION = 1;
// Hidden sheet holding the machine-readable copy inside an .xlsx export.
const DATA_SHEET = '_data';
// Excel caps a cell at 32,767 characters, so the payload is split across
// column A of consecutive rows and joined back on import.
const DATA_CHUNK = 30000;

const CATEGORIES: EventCategory[] = ['personal', 'work', 'travel', 'finance', 'health', 'other'];
const REPEATS: RepeatRule[] = ['none', 'yearly', 'monthly', 'weekly'];
const CARD_THEMES: CardTheme[] = ['clean', 'color', 'dark', 'custom'];
const SOUNDS: NotificationSoundKey[] = ['default', 'chime', 'bell', 'ping', 'pulse'];

interface ExportPayload {
  app: typeof APP_ID;
  version: number;
  exportedAt: string;
  events: PurEvent[];
}

// Strips what only makes sense on this one device: recorded voice files
// and locally picked photos live in the app's own storage (a path to them
// is useless anywhere else), and widgetId points into this install's own
// widget library. Remote photo URLs (category gallery) still work, so
// those are kept.
function toPortableEvent(event: PurEvent): PurEvent {
  const { customVoiceUri: _voice, widgetId: _widget, ...rest } = event;
  const photo = rest.customPhotoUri;
  if (photo && !/^https?:\/\//.test(photo)) {
    delete rest.customPhotoUri;
    if (rest.cardTheme === 'custom') rest.cardTheme = 'color';
  }
  return rest;
}

function buildPayload(events: PurEvent[]): ExportPayload {
  return { app: APP_ID, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), events: events.map(toPortableEvent) };
}

function exportFileName(format: ExportFormat): string {
  return `PuraEvents-${dayjs().format('YYYY-MM-DD')}.${format}`;
}

// One row per event, columns in the user's language. Dates are real Excel
// date cells (sortable/filterable), shown as "yyyy-mm-dd hh:mm" in the
// device's local time — the same time the app itself shows.
function buildXlsxBase64(events: PurEvent[], t: TFunction): string {
  const payload = buildPayload(events);

  const header = [
    t('dataExport.colTitle'),
    t('dataExport.colDateTime'),
    t('dataExport.colNextOccurrence'),
    t('dataExport.colTimezone'),
    t('dataExport.colCategory'),
    t('dataExport.colRepeat'),
    t('dataExport.colReminders'),
    t('dataExport.colNote'),
    t('dataExport.colShareMessage'),
    t('dataExport.colSender'),
  ];
  const rows = payload.events.map((event) => [
    event.title,
    new Date(event.dateTimeISO),
    new Date(getNextOccurrenceISO(event.dateTimeISO, event.repeat)),
    event.timezone,
    t(`events.category.${event.category}`),
    t(`events.repeat.${event.repeat}`),
    event.reminders.length ? event.reminders.map((m) => reminderLabel(m, t)).join(', ') : t('events.noReminders'),
    event.note ?? '',
    event.shareMessage ?? '',
    event.sender ?? '',
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows], { cellDates: true, dateNF: 'yyyy-mm-dd hh:mm' });
  sheet['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 40 }, { wch: 40 }, { wch: 16 }];
  if (rows.length) sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, t('dataExport.sheetName'));
  const json = JSON.stringify(payload);
  const chunks: string[][] = [];
  for (let i = 0; i < json.length; i += DATA_CHUNK) chunks.push([json.slice(i, i + DATA_CHUNK)]);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(chunks), DATA_SHEET);
  workbook.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] };

  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx', compression: true });
}

export type ExportDestination = 'device' | 'share';

const MIME: Record<ExportFormat, string> = {
  json: 'application/json',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// The file's contents, ready to write: JSON as plain text, Excel as base64.
function buildExport(events: PurEvent[], format: ExportFormat, t: TFunction): { content: string; base64: boolean } {
  return format === 'json'
    ? { content: JSON.stringify(buildPayload(events), null, 2), base64: false }
    : { content: buildXlsxBase64(events, t), base64: true };
}

// Writes the export to the cache directory and opens the share sheet, so
// the user can email it, put it on Drive, etc. (On iOS the share sheet
// also offers "Save to Files", so that's the only destination there.)
async function shareExport(events: PurEvent[], format: ExportFormat, t: TFunction): Promise<void> {
  const uri = `${FileSystem.cacheDirectory}${exportFileName(format)}`;
  const { content, base64 } = buildExport(events, format, t);
  await FileSystem.writeAsStringAsync(uri, content, base64 ? { encoding: FileSystem.EncodingType.Base64 } : undefined);
  await Sharing.shareAsync(uri, {
    mimeType: MIME[format],
    UTI: format === 'json' ? 'public.json' : 'org.openxmlformats.spreadsheetml.sheet',
    dialogTitle: t('dataExport.shareTitle'),
  });
}

// Android only: writes the export straight into the phone's Downloads
// folder (see modules/save-to-downloads) — no folder picker, which on
// Android 11+ won't even offer the Downloads root. Returns the file name
// actually used (Android renames on a clash, e.g. "… (1).xlsx").
async function saveExportToDevice(events: PurEvent[], format: ExportFormat, t: TFunction): Promise<string> {
  const name = exportFileName(format);
  const uri = `${FileSystem.cacheDirectory}${name}`;
  const { content, base64 } = buildExport(events, format, t);
  await FileSystem.writeAsStringAsync(uri, content, base64 ? { encoding: FileSystem.EncodingType.Base64 } : undefined);
  return saveToDownloads(uri, name, MIME[format]);
}

export type ExportResult = { saved: string } | { shared: true };

export async function exportEvents(
  events: PurEvent[],
  format: ExportFormat,
  destination: ExportDestination,
  t: TFunction
): Promise<ExportResult> {
  if (destination === 'device') return { saved: await saveExportToDevice(events, format, t) };
  await shareExport(events, format, t);
  return { shared: true };
}

export class ImportError extends Error {}

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
const optionalText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

// Turns one untrusted imported record into a valid event, or null when it
// can't be one (no title or no parseable date). Unknown enum values fall
// back to safe defaults instead of rejecting the whole event.
function normalizeEvent(raw: unknown): PurEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  const date = typeof r.dateTimeISO === 'string' ? new Date(r.dateTimeISO) : null;
  if (!title || !date || Number.isNaN(date.getTime())) return null;

  const now = new Date().toISOString();
  const photo = typeof r.customPhotoUri === 'string' && /^https?:\/\//.test(r.customPhotoUri) ? r.customPhotoUri : undefined;
  const cardTheme = pick(r.cardTheme, CARD_THEMES, 'color');
  return {
    id: typeof r.id === 'string' && r.id ? r.id : globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    dateTimeISO: date.toISOString(),
    timezone: typeof r.timezone === 'string' && r.timezone ? r.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone,
    category: pick(r.category, CATEGORIES, 'other'),
    accentColor: pick(r.accentColor, ACCENT_KEYS as readonly AccentKey[], 'violet'),
    cardTheme: cardTheme === 'custom' && !photo ? 'color' : cardTheme,
    customPhotoUri: photo,
    customWidgetName: optionalText(r.customWidgetName),
    customOverlayOpacity: typeof r.customOverlayOpacity === 'number' ? r.customOverlayOpacity : undefined,
    customCornerStyle: pick(r.customCornerStyle, ['sharp', 'rounded', 'extraRounded'] as const, 'rounded'),
    customTextStyle: pick(r.customTextStyle, ['system', 'bold', 'black'] as const, 'system'),
    note: optionalText(r.note),
    shareMessage: optionalText(r.shareMessage),
    sender: optionalText(r.sender),
    notificationSound: pick(r.notificationSound, SOUNDS, 'default'),
    repeat: pick(r.repeat, REPEATS, 'none'),
    reminders: Array.isArray(r.reminders) ? r.reminders.filter((m): m is number => typeof m === 'number' && m >= 0) : [],
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : now,
  };
}

function eventsFromPayloadText(text: string): PurEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportError('invalidFile');
  }
  // Older exports were a bare array of events; current ones wrap it.
  const list = Array.isArray(parsed) ? parsed : (parsed as Partial<ExportPayload> | null)?.events;
  if (!Array.isArray(list)) throw new ImportError('invalidFile');
  return list.map(normalizeEvent).filter((e): e is PurEvent => e !== null);
}

// Reads a picked file and returns the valid events in it. The format comes
// from the file itself: .xlsx is a zip ("PK" magic bytes), anything else is
// tried as JSON. A spreadsheet without our hidden data sheet (i.e. not one
// of our own exports) is rejected rather than guessed at.
export async function readImportFile(uri: string, name?: string): Promise<PurEvent[]> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const isXlsx = base64.startsWith('UEsD') || /\.xlsx$/i.test(name ?? '');

  if (isXlsx) {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(base64, { type: 'base64' });
    } catch {
      throw new ImportError('invalidFile');
    }
    const dataSheet = workbook.Sheets[DATA_SHEET];
    if (!dataSheet) throw new ImportError('notOurSpreadsheet');
    const chunks = XLSX.utils.sheet_to_json<string[]>(dataSheet, { header: 1, raw: true });
    return eventsFromPayloadText(chunks.map((row) => String(row[0] ?? '')).join(''));
  }

  const text = await FileSystem.readAsStringAsync(uri);
  return eventsFromPayloadText(text);
}
