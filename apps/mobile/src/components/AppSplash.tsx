import { useColorScheme, View } from 'react-native';

// Same colors as the native splash (app.json → expo-splash-screen).
export const SPLASH_BACKGROUND = { light: '#F1EFFC', dark: '#0E0E14' };

/** The splash background drawn in JS — just the splash color, matching the
 *  native splash (which is blank too: the logo only ever appears through
 *  AnimatedSplash's reveal, so it isn't shown twice). Shown wherever the app
 *  is up but not ready to draw yet: right after the native splash hides
 *  while the saved language loads, and while a reload to flip the layout
 *  direction is under way. */
export function AppSplash() {
  const scheme = useColorScheme();
  return <View style={{ flex: 1, backgroundColor: scheme === 'dark' ? SPLASH_BACKGROUND.dark : SPLASH_BACKGROUND.light }} />;
}
