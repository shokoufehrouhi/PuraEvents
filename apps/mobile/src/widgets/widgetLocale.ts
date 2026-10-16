import AsyncStorage from '@react-native-async-storage/async-storage';

import i18n, { SUPPORTED_LANGUAGES } from '../i18n';
import { loadPreferences, type CalendarSystem } from '../storage/preferences';

/** The app's own language and calendar, read straight from storage (same
 *  keys as src/i18n/direction.ts and storage/preferences.ts). Home-screen
 *  widgets are drawn outside React — and on Android maybe while the app
 *  isn't even open — so they can't use useTranslation()/usePreferences(). */
export async function loadWidgetLocale(): Promise<{ language: string; calendar: CalendarSystem }> {
  const saved = await AsyncStorage.getItem('puraevents:language').catch(() => null);
  const language = saved && (SUPPORTED_LANGUAGES as readonly string[]).includes(saved) ? saved : i18n.language;
  const { calendar } = await loadPreferences().catch(() => ({ calendar: 'gregorian' as const }));
  return { language, calendar };
}
