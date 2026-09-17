import { ExtensionStorage } from '@bacons/apple-targets';

import { listUpcomingEventsForWidgets } from './widgetEventSummary';
import { preparePhotoDataUri } from './widgetPhoto';

// Must match app.json's ios.entitlements app-group *and* the same string
// inside targets/widget/expo-target.config.js — both sides of the App
// Group have to agree on this exact identifier or they end up reading/
// writing two different sandboxed containers with the same name.
export const WIDGET_APP_GROUP = 'group.com.anonymous.puraevents.widget';
const STORAGE_KEY = 'events';

// The iOS widget extension (targets/widget/widget.swift) is a completely
// separate process from this app — it has no access to AsyncStorage, so
// the only way to hand it fresh data is writing a plain value into the App
// Group's shared UserDefaults (see the ExtensionStorage README) and asking
// WidgetKit to reload. Call this whenever an event is created/updated/
// deleted (see storage/events.ts) and once at app launch.
//
// Writes only the single soonest-upcoming event, not the whole list — every
// widget instance always shows that same one (see widget.swift's Provider,
// which just reads Shared.loadEvents().first), there's no more per-instance
// choice to resolve against a fuller list.
export async function syncIOSWidget(): Promise<void> {
  const events = await listUpcomingEventsForWidgets();
  const soonest = events[0];
  // Unlike Android (which resolves a 'custom' theme's photo on-demand, at
  // render time, from inside this same app process — see widgetPhoto.ts's
  // own callers), widget.swift runs as a fully separate process with no
  // access to expo-image-manipulator or this app's file system at all, so
  // the data: URI has to be pre-computed and handed across the App Group
  // *before* WidgetKit ever renders anything. Only for a 'custom' themed
  // event — every other theme is a flat accentHex fill the Swift side
  // already draws without any photo, so there's no reason to inflate
  // UserDefaults (loaded fully into the extension's own tight memory
  // budget at launch) with data nothing will read.
  const payload = soonest
    ? [{ ...soonest, photoDataUri: soonest.cardTheme === 'custom' ? await preparePhotoDataUri(soonest.customPhotoUri) : null }]
    : [];
  const storage = new ExtensionStorage(WIDGET_APP_GROUP);
  storage.set(STORAGE_KEY, payload.length ? JSON.stringify(payload) : undefined);
  ExtensionStorage.reloadWidget();
}
