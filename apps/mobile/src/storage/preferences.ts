import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppearanceMode = 'system' | 'light' | 'dark';
export type CalendarSystem = 'gregorian' | 'persian' | 'islamic';
export type TimeFormat = '12h' | '24h';

export interface Preferences {
  appearance: AppearanceMode;
  // NOTE: only 'gregorian' actually renders differently today. Persian/Islamic
  // conversion (e.g. via jalaali-js / a hijri library) is a follow-up — this
  // setting is stored and surfaced in UI ahead of that work landing.
  calendar: CalendarSystem;
  timeFormat: TimeFormat;
  firstDayOfWeek: 0 | 1 | 6; // 0 = Sunday, 1 = Monday, 6 = Saturday (dayjs convention)
  notificationsEnabled: boolean;
  soundsHapticsEnabled: boolean;
  autoTimezone: boolean;
  manualTimezone?: string;
  /** Minutes-before-event offsets applied to new events by default. */
  defaultReminderOffsets: number[];
}

export const DEFAULT_PREFERENCES: Preferences = {
  appearance: 'system',
  calendar: 'gregorian',
  timeFormat: '24h',
  firstDayOfWeek: 1,
  notificationsEnabled: true,
  soundsHapticsEnabled: true,
  autoTimezone: true,
  defaultReminderOffsets: [1440], // 1 day before
};

const STORAGE_KEY = 'puraevents:preferences';
// Pre-rename (PurEvents -> PuraEvents) key — loadPreferences() migrates any
// existing data forward once so installed users don't lose their settings
// under the new key.
const LEGACY_STORAGE_KEY = 'purevents:preferences';

export async function loadPreferences(): Promise<Preferences> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_PREFERENCES;
    }
  }

  const legacyRaw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacyRaw) return DEFAULT_PREFERENCES;
  try {
    const migrated = { ...DEFAULT_PREFERENCES, ...JSON.parse(legacyRaw) };
    await AsyncStorage.setItem(STORAGE_KEY, legacyRaw);
    await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
    return migrated;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}
