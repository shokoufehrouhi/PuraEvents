import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddWidgetStepIllustration, type AddWidgetStepKind } from '../src/components/AddWidgetStepIllustration';
import { AppAlertModal, type AppAlertState } from '../src/components/AppAlertModal';
import { MiniWidget } from '../src/components/MiniWidget';
import { Button } from '../src/components/ui/Button';
import { RTL_LANGUAGES, type SupportedLanguage } from '../src/i18n';
import { useTheme } from '../src/theme/PreferencesContext';
import type { PurEvent } from '../src/types/event';
import { openHomeScreenShortcutPermissionSettings } from '../src/utils/miuiPermissions';
import { requestPinWidgetToHomeScreen } from '../src/widgets/androidWidgetTask';

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

// isRTL flips this screen's own layout (illustration/badge/text order,
// margins, alignment) for fa/ar — deliberately independent of
// I18nManager.isRTL, which stays false app-wide until forceRTL() + a
// restart get wired up (see app/_layout.tsx's own note); RTL_LANGUAGES is
// keyed off the selected language directly instead, so this screen reads
// correctly right now regardless of that broader follow-up. The
// illustration itself is never mirrored — it depicts real, physically
// fixed OS chrome (e.g. iOS's Edit button always sits top-left on the
// device, in every language), not this app's own UI.
function Step({ number, text, illustration, isRTL }: { number: number; text: string; illustration: AddWidgetStepKind; isRTL: boolean }) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: spacing.lg }}>
      <AddWidgetStepIllustration kind={illustration} />
      <View
        style={{
          flex: 1,
          marginLeft: isRTL ? 0 : spacing.md,
          marginRight: isRTL ? spacing.md : 0,
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'flex-start',
        }}
      >
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: radius.md,
            backgroundColor: `${colors.primary}1A`,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: isRTL ? 0 : 12,
            marginLeft: isRTL ? 12 : 0,
          }}
        >
          <Text style={[typography.bodyStrong, { color: colors.primary, fontSize: 13 }]}>{number}</Text>
        </View>
        <Text style={[typography.body, { color: colors.text, flex: 1, marginTop: 2, textAlign: isRTL ? 'right' : 'left' }]}>{text}</Text>
      </View>
    </View>
  );
}

// Reached from the Widgets tab's own banner — this is about the *real*
// WidgetKit/AppWidget home-screen widget (see targets/widget/widget.swift
// and src/widgets/androidWidgetTask.tsx), not the in-app MiniWidget
// mockup/style-picker every other "Add Widget" button in this app opens.
export default function AddWidgetToHomeScreen() {
  const { t, i18n } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [requesting, setRequesting] = useState(false);
  const [alert, setAlert] = useState<AppAlertState | null>(null);
  const isAndroid = Platform.OS === 'android';
  const isRTL = RTL_LANGUAGES.includes(i18n.language as SupportedLanguage);

  // Android has AppWidgetManager.requestPinAppWidget, which
  // react-native-android-widget wraps — the launcher shows its own system
  // confirmation, so this only *starts* that flow, it doesn't guarantee
  // the user goes through with it (see requestPinWidgetToHomeScreen's own
  // comment on how a MIUI-style silent block gets detected). iOS has no
  // equivalent API at all (see the manual steps below): Apple keeps
  // placing a widget a manual, user-initiated action on every app, by
  // design, not something we failed to wire up.
  async function handlePinAndroid() {
    setRequesting(true);
    try {
      // requestPinWidgetToHomeScreen's own native call, and the up-to-45s
      // silentlyBlocked-detection wait inside it, both have no hard
      // ceiling on their own — this outer timeout (comfortably above that
      // 45s) means the loading state below always resolves to *something*
      // rather than blocking the screen indefinitely on some device/
      // launcher quirk (this flow has already run into plenty of MIUI
      // unpredictability).
      const result = await Promise.race([
        requestPinWidgetToHomeScreen(),
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 70_000)),
      ]);
      if (result === 'added') {
        setAlert({ title: t('addWidgetHome.successTitle'), message: t('addWidgetHome.successMessage'), variant: 'success' });
      } else if (result === 'silentlyBlocked') {
        setAlert({
          title: t('addWidgetHome.permissionTitle'),
          message: t('addWidgetHome.permissionMessage'),
          variant: 'warning',
          onSettings: openHomeScreenShortcutPermissionSettings,
        });
      } else if (result === 'timeout') {
        setAlert({ title: t('addWidgetHome.timeoutTitle'), message: t('addWidgetHome.timeoutMessage'), variant: 'error' });
      } else {
        setAlert({ title: t('addWidgetHome.unsupportedTitle'), message: t('addWidgetHome.unsupportedMessage'), variant: 'error' });
      }
    } finally {
      setRequesting(false);
    }
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.md }}
      >
        <Text style={[typography.body, { color: colors.secondary, marginBottom: spacing.lg, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('addWidgetHome.subtitle')}
        </Text>

        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <MiniWidget event={PREVIEW_EVENT} size="small" />
        </View>

        {isAndroid ? (
          <View style={{ marginBottom: spacing.xl }}>
            <Button label={t('addWidgetHome.pinButton')} onPress={handlePinAndroid} loading={requesting} />
            <Text style={[typography.caption, { color: colors.secondary, marginTop: spacing.sm, textAlign: 'center' }]}>
              {t('addWidgetHome.androidFallbackHint')}
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'flex-start', marginBottom: spacing.xl }}>
            <Ionicons name="information-circle-outline" size={16} color={colors.secondary} style={{ marginTop: 2 }} />
            <Text
              style={[
                typography.caption,
                { color: colors.secondary, marginLeft: isRTL ? 0 : 6, marginRight: isRTL ? 6 : 0, flex: 1, textAlign: isRTL ? 'right' : 'left' },
              ]}
            >
              {t('addWidgetHome.iosNote')}
            </Text>
          </View>
        )}

        <Text style={[typography.label, { color: colors.secondary, marginBottom: spacing.md, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('addWidgetHome.manualStepsTitle')}
        </Text>
        {isAndroid ? (
          <>
            <Step number={1} text={t('addWidgetHome.androidStep1')} illustration="long-press-home" isRTL={isRTL} />
            <Step number={2} text={t('addWidgetHome.androidStep2')} illustration="tap-widgets-menu" isRTL={isRTL} />
            <Step number={3} text={t('addWidgetHome.androidStep3')} illustration="drag-widget" isRTL={isRTL} />
          </>
        ) : (
          <>
            <Step number={1} text={t('addWidgetHome.iosStep1')} illustration="long-press-home" isRTL={isRTL} />
            <Step number={2} text={t('addWidgetHome.iosStep2')} illustration="tap-edit" isRTL={isRTL} />
            <Step number={3} text={t('addWidgetHome.iosStep3')} illustration="tap-plus" isRTL={isRTL} />
            <Step number={4} text={t('addWidgetHome.iosStep4')} illustration="search" isRTL={isRTL} />
            <Step number={5} text={t('addWidgetHome.iosStep5')} illustration="choose-size" isRTL={isRTL} />
          </>
        )}
      </ScrollView>

      <AppAlertModal alert={alert} onClose={() => setAlert(null)} />

      {/* Full-screen block, not just the button's own spinner (see
          Button's loading prop above) — the OS-level pin flow this button
          triggers can involve a real wait (see requestPinWidgetToHomeScreen's
          own comment on the 60s timeout), so this makes it obvious the
          whole app is busy with it, not just that one button. Not
          dismissible — there's nothing useful to cancel back into mid-wait. */}
      <Modal visible={requesting} transparent animationType="fade">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ alignItems: 'center', minWidth: 180, backgroundColor: colors.surface, borderRadius: 16, padding: spacing.lg }}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[typography.bodyStrong, { color: colors.text, marginTop: spacing.md }]}>{t('addWidgetHome.addingWidget')}</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}
