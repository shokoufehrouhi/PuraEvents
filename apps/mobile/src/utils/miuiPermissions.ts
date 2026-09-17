import { Linking, Platform } from 'react-native';

// MIUI's package-level permission editor — an undocumented but long-stable
// implicit intent action (no explicit component/package needed, so
// Linking.sendIntent can dispatch it directly) that opens Security app's
// own Permissions screen for this app, where "Home screen shortcuts"
// (the permission that silently blocks a widget pin request when off)
// actually lives. Not guaranteed to exist on every MIUI version, and never
// on non-MIUI Android, so this always has a real Settings fallback below
// rather than silently doing nothing if it can't resolve.
const MIUI_PERMISSION_EDITOR_ACTION = 'miui.intent.action.APP_PERM_EDITOR';
const PACKAGE_NAME = 'com.anonymous.puraevents';

// "Settings" button for HomeScreenShortcutPrompt's first-run nudge — tries
// to land the user directly on MIUI's own permission toggle; falls back to
// this app's plain Application Details settings page (works on every
// Android device, MIUI or not) if that intent doesn't resolve.
export async function openHomeScreenShortcutPermissionSettings(): Promise<void> {
  try {
    await Linking.sendIntent(MIUI_PERMISSION_EDITOR_ACTION, [{ key: 'extra_pkgname', value: PACKAGE_NAME }]);
  } catch {
    await Linking.openSettings();
  }
}

// Xiaomi/Redmi/POCO all ship MIUI (or its HyperOS successor) and share this
// same Security-app permission model — Build.BRAND/MANUFACTURER (exposed by
// React Native's own Platform.constants, no extra native module needed)
// name whichever of those three the device was sold under. Used to only
// show the proactive first-run prompt (see HomeScreenShortcutPrompt) where
// it's actually relevant — every other Android OEM either has no such
// restriction or exposes it as a normal runtime permission already covered
// elsewhere.
export function isLikelyMiuiDevice(): boolean {
  if (Platform.OS !== 'android') return false;
  const brand = String(Platform.constants?.Brand ?? '').toLowerCase();
  const manufacturer = String(Platform.constants?.Manufacturer ?? '').toLowerCase();
  return ['xiaomi', 'redmi', 'poco'].some((name) => brand.includes(name) || manufacturer.includes(name));
}
