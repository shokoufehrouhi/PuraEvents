import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { requestPinWidget } from 'react-native-android-widget';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniWidget } from '../src/components/MiniWidget';
import { Button } from '../src/components/ui/Button';
import { useTheme } from '../src/theme/PreferencesContext';
import type { PurEvent } from '../src/types/event';
import { ANDROID_WIDGET_NAME } from '../src/widgets/androidWidgetTask';

// Same fixed placeholder content as custom-widget.tsx's own DEFAULT_SAMPLE
// — this screen is about the *real* home-screen widget's look, not any
// one event, so it never shows real data even when a real "nearest
// upcoming event" exists.
const PREVIEW_EVENT: PurEvent = {
  id: 'preview',
  title: 'New York Trip',
  dateTimeISO: dayjs().add(5, 'day').toISOString(),
  timezone: 'America/New_York',
  category: 'travel',
  accentColor: 'violet',
  cardTheme: 'color',
  repeat: 'none',
  reminders: [],
  createdAt: '',
  updatedAt: '',
};

function Step({ number, text }: { number: number; text: string }) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md }}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: radius.md,
          backgroundColor: `${colors.primary}1A`,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <Text style={[typography.bodyStrong, { color: colors.primary, fontSize: 13 }]}>{number}</Text>
      </View>
      <Text style={[typography.body, { color: colors.text, flex: 1, marginTop: 2 }]}>{text}</Text>
    </View>
  );
}

// Reached from the Widgets tab's own banner — this is about the *real*
// WidgetKit/AppWidget home-screen widget (see targets/widget/widget.swift
// and src/widgets/androidWidgetTask.tsx), not the in-app MiniWidget
// mockup/style-picker every other "Add Widget" button in this app opens.
export default function AddWidgetToHomeScreen() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [requesting, setRequesting] = useState(false);
  const isAndroid = Platform.OS === 'android';

  // Android has AppWidgetManager.requestPinAppWidget, which
  // react-native-android-widget wraps — the launcher shows its own system
  // confirmation, so this only *starts* that flow, it doesn't guarantee
  // the user goes through with it. iOS has no equivalent API at all (see
  // the manual steps below): Apple keeps placing a widget a manual,
  // user-initiated action on every app, by design, not something we
  // failed to wire up.
  async function handlePinAndroid() {
    setRequesting(true);
    try {
      const accepted = await requestPinWidget({ widgetName: ANDROID_WIDGET_NAME });
      if (!accepted) {
        Alert.alert(t('addWidgetHome.unsupportedTitle'), t('addWidgetHome.unsupportedMessage'));
      }
    } finally {
      setRequesting(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.md }}
    >
      <Text style={[typography.body, { color: colors.secondary, marginBottom: spacing.lg }]}>{t('addWidgetHome.subtitle')}</Text>

      <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
        <MiniWidget event={PREVIEW_EVENT} size="small" />
      </View>

      {isAndroid ? (
        <View style={{ marginBottom: spacing.xl }}>
          <Button label={t('addWidgetHome.pinButton')} onPress={handlePinAndroid} disabled={requesting} />
          <Text style={[typography.caption, { color: colors.secondary, marginTop: spacing.sm, textAlign: 'center' }]}>
            {t('addWidgetHome.androidFallbackHint')}
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.xl }}>
          <Ionicons name="information-circle-outline" size={16} color={colors.secondary} style={{ marginTop: 2 }} />
          <Text style={[typography.caption, { color: colors.secondary, marginLeft: 6, flex: 1 }]}>{t('addWidgetHome.iosNote')}</Text>
        </View>
      )}

      <Text style={[typography.label, { color: colors.secondary, marginBottom: spacing.md }]}>
        {t('addWidgetHome.manualStepsTitle')}
      </Text>
      {isAndroid ? (
        <>
          <Step number={1} text={t('addWidgetHome.androidStep1')} />
          <Step number={2} text={t('addWidgetHome.androidStep2')} />
          <Step number={3} text={t('addWidgetHome.androidStep3')} />
        </>
      ) : (
        <>
          <Step number={1} text={t('addWidgetHome.iosStep1')} />
          <Step number={2} text={t('addWidgetHome.iosStep2')} />
          <Step number={3} text={t('addWidgetHome.iosStep3')} />
          <Step number={4} text={t('addWidgetHome.iosStep4')} />
          <Step number={5} text={t('addWidgetHome.iosStep5')} />
        </>
      )}
    </ScrollView>
  );
}
