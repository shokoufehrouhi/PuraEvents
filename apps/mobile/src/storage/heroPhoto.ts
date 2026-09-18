import AsyncStorage from '@react-native-async-storage/async-storage';

import { persistRemoteImage } from '../utils/persistImage';

// Caches the Events tab's own "Today" hero banner photo (a random Pexels
// city photo, see utils/locationPhoto.ts) as a local file, keyed by nothing
// but "the most recent one" — so the home-screen widget's own empty state
// (see widgets/androidWidgetTask.tsx / widgets/iosWidgetSync.ts) can show
// that same photo without making its own network call from a background
// refresh (a widget provider doing its own Pexels fetch on every
// updatePeriodMillis tick would both burn API quota fast and risk a slow/
// failed refresh on a bad connection — reusing whatever the app itself
// already fetched avoids both).
const STORAGE_KEY = 'puraevents:cachedHeroPhoto';

// Downloads and persists the given Pexels photo URL (see
// persistImage.ts's own relative-path convention — same format
// customPhotoUri is stored in), replacing whatever was cached before.
// Silently no-ops on failure (persistRemoteImage itself falls back to the
// original remote URL rather than throwing) — the widget side's own
// preparePhotoDataUri already treats an unresolvable path as "no photo".
export async function cacheHeroPhoto(remoteUrl: string): Promise<void> {
  const relativePath = await persistRemoteImage(remoteUrl);
  await AsyncStorage.setItem(STORAGE_KEY, relativePath);
}

export async function getCachedHeroPhotoPath(): Promise<string | undefined> {
  return (await AsyncStorage.getItem(STORAGE_KEY)) ?? undefined;
}
