import AsyncStorage from '@react-native-async-storage/async-storage';

import type { NewEventInput, PurEvent } from '../types/event';
import { getNextOccurrenceISO } from '../utils/recurrence';

// MVP is offline-first: everything lives on-device. Cloud sync (Pro) comes in
// a later phase and will layer on top of this same read/write API rather
// than replacing it, so keep the surface small and serializable.
const STORAGE_KEY = 'puraevents:events';
// Pre-rename (PurEvents -> PuraEvents) key — readAll() migrates any
// existing data forward once so installed users don't see their events
// "disappear" under the new key.
const LEGACY_STORAGE_KEY = 'purevents:events';

async function readAll(): Promise<PurEvent[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as PurEvent[];
    } catch {
      return [];
    }
  }

  const legacyRaw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacyRaw) return [];
  try {
    const migrated = JSON.parse(legacyRaw) as PurEvent[];
    await AsyncStorage.setItem(STORAGE_KEY, legacyRaw);
    await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
    return migrated;
  } catch {
    return [];
  }
}

async function writeAll(events: PurEvent[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export async function listEvents(): Promise<PurEvent[]> {
  const events = await readAll();
  // Sort by *next* occurrence, not the raw stored date — a weekly/monthly/
  // yearly event whose original date already passed should sort (and
  // count down) based on when it next actually happens.
  return events.sort((a, b) =>
    getNextOccurrenceISO(a.dateTimeISO, a.repeat).localeCompare(getNextOccurrenceISO(b.dateTimeISO, b.repeat))
  );
}

export async function getEvent(id: string): Promise<PurEvent | undefined> {
  const events = await readAll();
  return events.find((e) => e.id === id);
}

export async function createEvent(input: NewEventInput): Promise<PurEvent> {
  const now = new Date().toISOString();
  const event: PurEvent = {
    ...input,
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: now,
    updatedAt: now,
  };
  const events = await readAll();
  events.push(event);
  await writeAll(events);
  return event;
}

export async function updateEvent(id: string, patch: Partial<NewEventInput>): Promise<PurEvent | undefined> {
  const events = await readAll();
  const index = events.findIndex((e) => e.id === id);
  if (index === -1) return undefined;
  const updated: PurEvent = { ...events[index], ...patch, updatedAt: new Date().toISOString() };
  events[index] = updated;
  await writeAll(events);
  return updated;
}

export async function deleteEvent(id: string): Promise<void> {
  const events = await readAll();
  await writeAll(events.filter((e) => e.id !== id));
}
