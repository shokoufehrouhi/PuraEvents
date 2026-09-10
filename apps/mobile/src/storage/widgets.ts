import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PurEvent, Widget } from '../types/event';
import { listEvents, updateEvent } from './events';

// Widgets used to just be whatever custom* fields happened to be on an
// event (see widgetId's comment on PurEvent) — a widget is its own record
// now, independent of which event(s), if any, currently point at it.
const STORAGE_KEY = 'puraevents:widgets';
// Set once the legacy backfill below has run — without this, *every*
// event with a customPhotoUri and no widgetId looks "legacy" forever, not
// just the ones that predate widgets having their own storage. A Category
// photo (see categoryPhoto.ts) is deliberately just a look set directly on
// an event, with no saved Widget of its own — re-running the backfill on
// every listWidgets() call would sweep every one of those into "My
// Widgets" too, which is exactly the bug this flag prevents.
const MIGRATED_KEY = 'puraevents:widgetsMigrated';

async function readAll(): Promise<Widget[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Widget[];
  } catch {
    return [];
  }
}

async function writeAll(widgets: Widget[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// One-time backfill for events saved before widgets had their own storage
// — each already has a full custom* snapshot but no widgetId, so synthesize
// a Widget record from it and link it back. Guarded by MIGRATED_KEY so it
// only ever does this once, total — see that key's comment for why running
// it more than once is a real bug, not just wasted work.
async function migrateLegacyWidgets(existing: Widget[]): Promise<Widget[]> {
  const alreadyMigrated = await AsyncStorage.getItem(MIGRATED_KEY);
  if (alreadyMigrated) return existing;

  const events = await listEvents();
  const legacy = events.filter((e): e is PurEvent & { customPhotoUri: string } => Boolean(e.customPhotoUri) && !e.widgetId);

  if (legacy.length > 0) {
    const now = new Date().toISOString();
    const created: Widget[] = [];
    for (const event of legacy) {
      const widget: Widget = {
        id: newId(),
        name: event.customWidgetName,
        photoUri: event.customPhotoUri,
        overlayOpacity: event.customOverlayOpacity,
        cornerStyle: event.customCornerStyle,
        textStyle: event.customTextStyle,
        accentColor: event.accentColor,
        createdAt: event.createdAt || now,
        updatedAt: now,
      };
      created.push(widget);
      await updateEvent(event.id, { widgetId: widget.id });
    }
    existing = [...existing, ...created];
    await writeAll(existing);
  }

  await AsyncStorage.setItem(MIGRATED_KEY, '1');
  return existing;
}

export async function listWidgets(): Promise<Widget[]> {
  return migrateLegacyWidgets(await readAll());
}

export async function getWidget(id: string): Promise<Widget | undefined> {
  const widgets = await readAll();
  return widgets.find((w) => w.id === id);
}

export async function createWidget(input: Omit<Widget, 'id' | 'createdAt' | 'updatedAt'>): Promise<Widget> {
  const now = new Date().toISOString();
  const widget: Widget = { ...input, id: newId(), createdAt: now, updatedAt: now };
  const widgets = await readAll();
  widgets.push(widget);
  await writeAll(widgets);
  return widget;
}

export async function updateWidget(id: string, patch: Partial<Omit<Widget, 'id' | 'createdAt'>>): Promise<Widget | undefined> {
  const widgets = await readAll();
  const index = widgets.findIndex((w) => w.id === id);
  if (index === -1) return undefined;
  const updated: Widget = { ...widgets[index], ...patch, updatedAt: new Date().toISOString() };
  widgets[index] = updated;
  await writeAll(widgets);
  return updated;
}

export async function deleteWidget(id: string): Promise<void> {
  const widgets = await readAll();
  await writeAll(widgets.filter((w) => w.id !== id));
}
