import { ScrollView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Row } from '../src/components/ui/Row';
import { Section } from '../src/components/ui/Section';
import { applyNotificationsEnabledChange } from '../src/notifications';
import { unseenNotificationCount } from '../src/storage/notificationLog';
import { usePro } from '../src/subscription';
import { usePreferences, useTheme } from '../src/theme/PreferencesContext';
import { rowBadgeColors } from '../src/theme/tokens';
import { awaitPick } from '../src/utils/pickerBridge';
import { getActiveReminders, reminderLabel } from '../src/utils/reminders';

// Sub-screen for the Settings "Notifications" menu row — moved out of the
// Settings tab's own inline Section per explicit request that each of its
// 4 top-level menus (Appearance/Notifications/Data & Privacy/About) drill
// into its own screen instead of showing sub-rows inline.
export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { prefs, setPrefs } = usePreferences();
  const { isPro } = usePro();
  const [unseenCount, setUnseenCount] = useState(0);

  // Re-read every time this screen regains focus — coming back from
  // History (which marks everything seen on open) should clear the badge
  // below without needing to leave/re-enter Settings entirely.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      unseenNotificationCount().then((count) => {
        if (!cancelled) setUnseenCount(count);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // The reminders a new event starts with. Shown as the plan actually
  // applies them (a free plan keeps only "1 day before").
  const defaultReminders = getActiveReminders(prefs.defaultReminderOffsets, isPro);
  const defaultRemindersLabel =
    defaultReminders.length === 0
      ? t('events.noReminders')
      : defaultReminders.length === 1
        ? reminderLabel(defaultReminders[0], t)
        : t('events.reminderCountMany', { count: defaultReminders.length });

  // Same list the New/Edit Event screen uses, saved as the default.
  async function pickDefaultReminders() {
    router.push({ pathname: '/reminder-picker', params: { current: JSON.stringify(prefs.defaultReminderOffsets) } });
    const picked = await awaitPick();
    setPrefs({ defaultReminderOffsets: JSON.parse(picked) as number[] });
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Section>
        <Row
          type="switch"
          icon="notifications-outline"
          badgeColor={rowBadgeColors.red}
          label={t('settings.notifications')}
          value={prefs.notificationsEnabled}
          onValueChange={(v) => {
            setPrefs({ notificationsEnabled: v });
            // Immediate, not waiting for the next event save/open —
            // cancels (or reschedules) every reminder right away. Passed
            // explicitly rather than read back from storage since
            // setPrefs's own save isn't awaited (see
            // scheduleRemindersForEvent's own comment on this).
            applyNotificationsEnabledChange(v, isPro);
          }}
        />
        <Row
          icon="alarm-outline"
          badgeColor={rowBadgeColors.orange}
          label={t('settings.defaultReminders')}
          value={defaultRemindersLabel}
          onPress={pickDefaultReminders}
        />
        <Row
          type="switch"
          icon="volume-medium-outline"
          badgeColor={rowBadgeColors.purple}
          label={t('settings.soundsHaptics')}
          value={prefs.soundsHapticsEnabled}
          onValueChange={(v) => setPrefs({ soundsHapticsEnabled: v })}
        />
        <Row
          icon="time-outline"
          badgeColor={rowBadgeColors.blue}
          label={t('settings.notificationHistory')}
          value={unseenCount > 0 ? t('notificationHistory.newCount', { count: unseenCount }) : undefined}
          onPress={() => router.push('/notification-history')}
        />
      </Section>
    </ScrollView>
  );
}
