import { Image, useColorScheme, View } from 'react-native';

// Same colors as the native splash (app.json → expo-splash-screen).
const BACKGROUND = { light: '#FFFFFF', dark: '#0E0E14' };

/** The splash screen drawn in JS — the logo centered on the splash color.
 *  Shown wherever the app is up but not ready to draw yet: right after
 *  the native splash hides while the saved language loads, and while a
 *  Google Drive restore runs and the app reloads. Sized to sit where the
 *  native splash's logo does, so the hand-over doesn't jump. */
export function AppSplash() {
  const scheme = useColorScheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: scheme === 'dark' ? BACKGROUND.dark : BACKGROUND.light,
      }}
    >
      <Image source={require('../../assets/images/app-logo.png')} style={{ width: 120, height: 120 }} />
    </View>
  );
}
