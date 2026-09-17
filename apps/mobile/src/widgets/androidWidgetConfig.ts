import AsyncStorage from '@react-native-async-storage/async-storage';

// Android natively supports multiple independent instances of the same
// AppWidgetProvider, each with its own numeric widgetId — this is that
// per-instance "which event did the user pick for *this* widget"
// configuration, keyed by widgetId. Set once during
// ConfigurationScreen (androidWidgetTask.tsx) and read every time that
// instance re-renders (WIDGET_UPDATE, resize, periodic refresh, ...).
const STORAGE_KEY = 'puraevents:androidWidgetConfig';

async function readAll(): Promise<Record<number, string>> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<number, string>;
  } catch {
    return {};
  }
}

async function writeAll(map: Record<number, string>): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export async function getConfiguredEventId(widgetId: number): Promise<string | null> {
  const map = await readAll();
  return map[widgetId] ?? null;
}

export async function setConfiguredEventId(widgetId: number, eventId: string): Promise<void> {
  const map = await readAll();
  map[widgetId] = eventId;
  await writeAll(map);
}

// Called on WIDGET_DELETED — without this, removed-then-re-added widgets
// could theoretically collide on a reused widgetId and inherit a stale
// event choice instead of prompting fresh configuration.
export async function clearConfiguredEventId(widgetId: number): Promise<void> {
  const map = await readAll();
  if (!(widgetId in map)) return;
  delete map[widgetId];
  await writeAll(map);
}

// requestPinWidget() (Android's AppWidgetManager.requestPinAppWidget) has no
// way to pass data through to the ConfigurationScreen that the OS opens for
// the new instance afterward — the system, not our JS, decides the new
// widgetId, only once the user accepts its own "Add to Home screen?"
// prompt. This is the workaround: an event picked from the event detail
// screen (see requestPinWidgetForEvent in androidWidgetTask.tsx) gets
// stashed here just before the OS prompt, and the ConfigurationScreen reads
// (and clears) it as soon as it mounts, to auto-select that event instead
// of making the user pick it again from the list they just came from.
const PENDING_KEY = 'puraevents:androidWidgetPendingEventId';

export async function setPendingConfigureEventId(eventId: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY, eventId);
}

// "Take", not "get" — always clears, so a leftover value can never
// auto-select itself into some later, unrelated widget (e.g. one added from
// the generic Widgets tab button right after, or the same event's own next
// widget if this one's ConfigurationScreen never actually mounted for some
// reason).
export async function takePendingConfigureEventId(): Promise<string | null> {
  const id = await AsyncStorage.getItem(PENDING_KEY);
  if (id) await AsyncStorage.removeItem(PENDING_KEY);
  return id;
}

// Non-consuming read, for the headless widgetTaskHandler's own WIDGET_ADDED
// render (androidWidgetTask.tsx) — that handler and the ConfigurationScreen
// are two independent JS entry points the OS can invoke in either order (on
// MIUI in particular, WIDGET_ADDED can fire and start rendering before the
// configure Activity's own pick() ever runs), and getConfiguredEventId is
// still unset at that point since only pick() (via setConfiguredEventId)
// ever writes it. Falling back straight to "soonest upcoming event"
// (events[0]) there picked the *wrong* event whenever the one actually
// being configured wasn't the soonest — checking this un-consumed pending
// id first renders the *right* event immediately instead, without racing
// or stealing the value ConfigurationScreen itself still needs to take.
export async function peekPendingConfigureEventId(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_KEY);
}
