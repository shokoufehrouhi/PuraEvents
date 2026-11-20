import AsyncStorage from '@react-native-async-storage/async-storage';

// Set by a Google Drive restore right before it reloads the app, so the
// reloaded app knows to carry the restore screen through to the end instead
// of dropping back to the plain splash (see components/RestoreSplash.tsx).
const KEY = 'puraevents:justRestored';

export function markJustRestored(): Promise<void> {
  return AsyncStorage.setItem(KEY, '1').catch(() => {});
}

export function wasJustRestored(): Promise<boolean> {
  return AsyncStorage.getItem(KEY).then((v) => v === '1', () => false);
}

export function clearJustRestored(): Promise<void> {
  return AsyncStorage.removeItem(KEY).catch(() => {});
}
