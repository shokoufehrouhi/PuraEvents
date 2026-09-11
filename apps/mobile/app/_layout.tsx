import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useTranslation } from 'react-i18next';

import { requestNotificationPermissions } from '../src/notifications';
import { usePro } from '../src/subscription';
import { PreferencesProvider, useTheme } from '../src/theme/PreferencesContext';

// Side-effect import: initializes i18next before any screen renders.
// NOTE: RTL languages (fa, ar — see src/i18n) only fully mirror the layout
// after I18nManager.forceRTL() + an app restart, which isn't wired up yet.
// Track as a follow-up before shipping fa/ar as selectable languages.
import '../src/i18n';

function Navigation() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const { isPro } = usePro();

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
        {/* Push, not modal — opens the same way event/[id]/index (Details)
            does, per explicit request to match that navigation feel. */}
        <Stack.Screen name="event/new" />
        <Stack.Screen name="event/category-picker" />
        <Stack.Screen name="event/repeat-picker" />
        <Stack.Screen name="event/[id]/index" />
        <Stack.Screen name="event/[id]/edit" />
        <Stack.Screen
          name="preferences"
          options={{ ...headerOptions, title: t('preferences.title'), headerBackTitle: t('settings.title') }}
        />
        <Stack.Screen
          name="language-picker"
          options={{ ...headerOptions, title: t('preferences.language'), headerBackTitle: t('preferences.title') }}
        />
        <Stack.Screen
          name="theme-picker"
          options={{ ...headerOptions, title: t('preferences.appearance'), headerBackTitle: t('preferences.title') }}
        />
        <Stack.Screen
          name="calendar-picker"
          options={{ ...headerOptions, title: t('preferences.calendar'), headerBackTitle: t('preferences.title') }}
        />
        <Stack.Screen
          name="first-day-picker"
          options={{ ...headerOptions, title: t('preferences.firstDayOfWeek'), headerBackTitle: t('preferences.title') }}
        />
        <Stack.Screen
          name="time-format-picker"
          options={{ ...headerOptions, title: t('preferences.timeFormat'), headerBackTitle: t('preferences.title') }}
        />
        <Stack.Screen
          name="timezone-picker"
          options={{ ...headerOptions, title: t('preferences.currentTimezone'), headerBackTitle: t('preferences.title') }}
        />
        {/* headerBackButtonDisplayMode 'minimal', not a title string, to
            match the reference design's plain chevron. */}
        <Stack.Screen
          name="upgrade"
          options={{ ...headerOptions, title: t('compare.title'), headerBackButtonDisplayMode: 'minimal' }}
        />
        <Stack.Screen
          name="custom-widget"
          options={{ ...headerOptions, title: t('widgets.customWidgetTitle'), headerBackTitle: t('widgets.title') }}
        />
        <Stack.Screen
          name="widget-size-picker"
          options={{ ...headerOptions, title: t('widgets.widgetSize'), headerBackTitle: t('widgets.customWidgetTitle') }}
        />
        {/* headerBackButtonDisplayMode 'minimal', not a headerBackTitle
            string — New/Edit Event (whichever opened this) doesn't expose
            one shared title this could reuse, same as
            event/repeat-picker's own back chevron having no label
            either. (headerBackTitle: '' alone doesn't reliably suppress
            the fallback label here.) */}
        <Stack.Screen
          name="reminder-picker"
          options={{ ...headerOptions, title: t('events.stepReminders'), headerBackButtonDisplayMode: 'minimal' }}
        />
        <Stack.Screen
          name="widget-overlay-picker"
          options={{ ...headerOptions, title: t('widgets.overlay'), headerBackTitle: t('widgets.customWidgetTitle') }}
        />
        <Stack.Screen
          name="widget-accent-picker"
          options={{ ...headerOptions, title: t('widgets.accentColor'), headerBackTitle: t('widgets.customWidgetTitle') }}
        />
        <Stack.Screen
          name="widget-corner-picker"
          options={{ ...headerOptions, title: t('widgets.cornerStyle'), headerBackTitle: t('widgets.customWidgetTitle') }}
        />
        <Stack.Screen
          name="widget-text-style-picker"
          options={{ ...headerOptions, title: t('widgets.textStyle'), headerBackTitle: t('widgets.customWidgetTitle') }}
        />
        <Stack.Screen
          name="category-themes"
          options={{ ...headerOptions, title: t('widgets.categoryThemes'), headerBackTitle: t('widgets.title') }}
        />
        <Stack.Screen
          name="widget-picker"
          options={{
            ...headerOptions,
            title: t('widgets.chooseWidget'),
            headerBackTitle: t('widgets.title'),
            // "Upgrade" CTA, not a plan-status badge — only shown to a free
            // user (isPro true hides it, nothing left to upsell). The
            // label itself is "Get Pro", not bare "Pro" — the bare word
            // read like a status badge ("you have Pro") even to a free
            // user looking right at correctly-locked content underneath,
            // rather than the tap-to-upgrade prompt it actually is.
            headerRight: isPro
              ? undefined
              : () => (
                  <Pressable
                    onPress={() => router.push('/upgrade')}
                    hitSlop={8}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: colors.primary,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                    }}
                  >
                    <Ionicons name="diamond" size={11} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', marginLeft: 4 }}>{t('widgets.getPro').toUpperCase()}</Text>
                  </Pressable>
                ),
          }}
        />
        <Stack.Screen
          name="notification-settings"
          options={{ ...headerOptions, title: t('settings.notifications'), headerBackTitle: t('settings.title') }}
        />
        <Stack.Screen
          name="data-privacy"
          options={{ ...headerOptions, title: t('settings.dataPrivacy'), headerBackTitle: t('settings.title') }}
        />
        <Stack.Screen
          name="privacy"
          options={{ ...headerOptions, title: t('settings.privacy'), headerBackTitle: t('settings.title') }}
        />
        <Stack.Screen
          name="about"
          options={{ ...headerOptions, title: t('settings.about'), headerBackTitle: t('settings.title') }}
        />
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
