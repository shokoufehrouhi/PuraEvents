import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useTranslation } from 'react-i18next';

import { requestNotificationPermissions } from '../src/notifications';
import { PreferencesProvider, useTheme } from '../src/theme/PreferencesContext';

// Side-effect import: initializes i18next before any screen renders.
// NOTE: RTL languages (fa, ar — see src/i18n) only fully mirror the layout
// after I18nManager.forceRTL() + an app restart, which isn't wired up yet.
// Track as a follow-up before shipping fa/ar as selectable languages.
import '../src/i18n';

function Navigation() {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();

  useEffect(() => {
    requestNotificationPermissions();
  }, []);

  const headerOptions = {
    headerShown: true,
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.text,
    headerShadowVisible: false,
  };

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="day" options={{ ...headerOptions, title: t('tabs.events'), headerBackTitle: t('day.backTitle') }} />
        <Stack.Screen name="event/new" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="event/category-picker" />
        <Stack.Screen name="event/repeat-picker" />
        <Stack.Screen name="event/[id]/index" />
        <Stack.Screen name="event/[id]/edit" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen
          name="preferences"
          options={{ ...headerOptions, title: t('preferences.title'), headerBackTitle: t('settings.title') }}
        />
        <Stack.Screen
          name="language-picker"
          options={{ ...headerOptions, title: t('preferences.language'), headerBackTitle: t('preferences.title') }}
        />
        <Stack.Screen
          name="timezone-picker"
          options={{ ...headerOptions, title: t('preferences.currentTimezone'), headerBackTitle: t('preferences.title') }}
        />
        <Stack.Screen
          name="upgrade"
          options={{ ...headerOptions, title: t('compare.title'), headerBackTitle: t('settings.title') }}
        />
        <Stack.Screen
          name="privacy"
          options={{ ...headerOptions, title: t('settings.privacy'), headerBackTitle: t('settings.title') }}
        />
        <Stack.Screen
          name="about"
          options={{ ...headerOptions, title: t('settings.about'), headerBackTitle: t('settings.title') }}
        />
        <Stack.Screen name="paywall" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PreferencesProvider>
        <Navigation />
      </PreferencesProvider>
    </SafeAreaProvider>
  );
}
