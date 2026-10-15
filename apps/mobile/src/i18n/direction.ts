import AsyncStorage from '@react-native-async-storage/async-storage';
import { reloadAppAsync } from 'expo';
import { I18nManager } from 'react-native';

import i18n, { RTL_LANGUAGES, SUPPORTED_LANGUAGES, type SupportedLanguage } from './index';
import { syncHomeScreenWidget } from '../widgets/syncHomeScreenWidget';

const LANGUAGE_KEY = 'puraevents:language';
// Set right before a direction reload and cleared once the app comes back
// mirrored the right way — if forceRTL() didn't take (it can't be checked
// any other way), the next launch must not reload again, forever.
const RELOAD_GUARD_KEY = 'puraevents:directionReload';

export function isRTLLanguage(lang: string): boolean {
  return RTL_LANGUAGES.includes(lang as SupportedLanguage);
}

/** React Native only mirrors the layout (row order, start/end margins,
 *  navigation) after I18nManager.forceRTL() and a full JS reload, and the
 *  native side persists the flag across launches. Returns true when a
 *  reload was started, so the caller can skip rendering in the meantime.
 *  allowRTL follows the same flag: left on, Android would also mirror an
 *  English UI on a phone whose system language is Farsi. */
async function ensureDirection(lang: string): Promise<boolean> {
  const wantRTL = isRTLLanguage(lang);
  if (I18nManager.isRTL === wantRTL) {
    await AsyncStorage.removeItem(RELOAD_GUARD_KEY);
    return false;
  }
  if ((await AsyncStorage.getItem(RELOAD_GUARD_KEY)) === lang) return false;
  await AsyncStorage.setItem(RELOAD_GUARD_KEY, lang);
  I18nManager.allowRTL(wantRTL);
  I18nManager.forceRTL(wantRTL);
  await reloadAppAsync('Layout direction changed');
  return true;
}

/** Startup: the language the user picked (else the device's, which
 *  i18n/index.ts already chose), with the layout direction to match. */
export async function restoreLanguage(): Promise<boolean> {
  const saved = await AsyncStorage.getItem(LANGUAGE_KEY).catch(() => null);
  if (saved && (SUPPORTED_LANGUAGES as readonly string[]).includes(saved) && saved !== i18n.language) {
    await i18n.changeLanguage(saved);
  }
  return ensureDirection(i18n.language);
}

/** The language picker: remember the choice and, when it flips between an
 *  LTR and an RTL language, restart the app so the whole layout mirrors. */
export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  await i18n.changeLanguage(lang);
  // The home-screen widget draws its own text (see androidWidgetTask.tsx).
  syncHomeScreenWidget().catch(() => {});
  await ensureDirection(lang);
}
