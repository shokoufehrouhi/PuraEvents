import { Ionicons } from '@expo/vector-icons';
import type { ExpoCalendar } from 'expo-calendar';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';

import {
  ensureCalendarPermission,
  forgetDeletedImports,
  listImportableCalendars,
  loadCalendarSettings,
  removeExportCalendar,
  saveCalendarSettings,
  syncCalendars,
  type CalendarSyncSettings,
} from '../src/calendar/calendarSync';
import { AppAlertModal, type AppAlertState } from '../src/components/AppAlertModal';
import { Row } from '../src/components/ui/Row';
import { Section } from '../src/components/ui/Section';
import { usePro } from '../src/subscription';
import { usePreferences, useTheme } from '../src/theme/PreferencesContext';
import { rowBadgeColors } from '../src/theme/tokens';
import { formatCivilDateFull, localizeDigits } from '../src/utils/calendars';

// Settings → Calendar sync (Pro): the two directions of
// calendar/calendarSync.ts, each switched on separately, plus which phone
// calendars to bring events in from.
export default function CalendarSyncScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const { prefs } = usePreferences();
  const { isPro } = usePro();
  const [settings, setSettings] = useState<CalendarSyncSettings | null>(null);
  const [calendars, setCalendars] = useState<ExpoCalendar[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [alert, setAlert] = useState<AppAlertState | null>(null);

  useEffect(() => {
    loadCalendarSettings().then((s) => {
      setSettings(s);
      if (s.importEnabled) listImportableCalendars().then(setCalendars, () => {});
    });
  }, []);

  async function run() {
    setSyncing(true);
    await syncCalendars();
    setSettings(await loadCalendarSettings());
    setSyncing(false);
  }

  // Both switches need calendar access first; without it, explain and
  // offer the system settings instead of silently doing nothing.
  async function withPermission(): Promise<boolean> {
    if (!isPro) {
      router.push('/upgrade');
      return false;
    }
    if (await ensureCalendarPermission()) return true;
    setAlert({
      title: t('calendarSync.permissionTitle'),
      message: t('calendarSync.permissionMessage'),
      variant: 'warning',
      onSettings: () => Linking.openSettings(),
    });
    return false;
  }

  async function toggleExport(on: boolean) {
    if (on) {
      if (!(await withPermission())) return;
      setSettings(await saveCalendarSettings({ exportEnabled: true }));
      await run();
    } else {
      await removeExportCalendar();
      setSettings(await saveCalendarSettings({ exportEnabled: false }));
    }
  }

  async function toggleImport(on: boolean) {
    if (on && !(await withPermission())) return;
    // Off and on again brings back events deleted in the app earlier.
    if (on) await forgetDeletedImports();
    setSettings(await saveCalendarSettings({ importEnabled: on }));
    if (on) {
      setCalendars(await listImportableCalendars().catch(() => []));
      await run();
    }
  }

  async function toggleCalendar(id: string) {
    if (!settings) return;
    const ids = settings.importCalendarIds.includes(id)
      ? settings.importCalendarIds.filter((c) => c !== id)
      : [...settings.importCalendarIds, id];
    setSettings(await saveCalendarSettings({ importCalendarIds: ids }));
    await run();
  }

  if (!settings) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md, paddingBottom: 48 }}>
      <Section>
        <Row
          type="switch"
          icon="arrow-up-circle-outline"
          badgeColor={rowBadgeColors.purple}
          label={t('calendarSync.export')}
          value={settings.exportEnabled}
          onValueChange={toggleExport}
        />
      </Section>
      <Text style={[typography.caption, { color: colors.secondary, marginTop: -spacing.sm, marginHorizontal: spacing.sm, marginBottom: spacing.lg }]}>
        {t('calendarSync.exportNote')}
      </Text>

      <Section>
        <Row
          type="switch"
          icon="arrow-down-circle-outline"
          badgeColor={rowBadgeColors.blue}
          label={t('calendarSync.import')}
          value={settings.importEnabled}
          onValueChange={toggleImport}
        />
        {settings.importEnabled
          ? calendars.map((calendar) => {
              const selected = settings.importCalendarIds.includes(calendar.id);
              return (
                <Pressable
                  key={calendar.id}
                  onPress={() => toggleCalendar(calendar.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md }}
                >
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: calendar.color ?? colors.outline }} />
                  <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
                    <Text style={[typography.body, { color: colors.text }]} numberOfLines={1}>
                      {calendar.title}
                    </Text>
                    {calendar.source?.name && calendar.source.name !== calendar.title ? (
                      <Text style={[typography.caption, { color: colors.secondary }]} numberOfLines={1}>
                        {calendar.source.name}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? colors.primary : colors.outline} />
                </Pressable>
              );
            })
          : null}
      </Section>
      <Text style={[typography.caption, { color: colors.secondary, marginTop: -spacing.sm, marginHorizontal: spacing.sm, marginBottom: spacing.lg }]}>
        {settings.importEnabled && !calendars.length ? t('calendarSync.noCalendars') : t('calendarSync.importNote')}
      </Text>

      {settings.exportEnabled || settings.importEnabled ? (
        <>
          <Section>
            <Row
              icon="sync-outline"
              badgeColor={rowBadgeColors.green}
              label={t('calendarSync.syncNow')}
              onPress={syncing ? undefined : run}
            />
          </Section>
          <Text style={[typography.caption, { color: colors.secondary, marginTop: -spacing.sm, marginHorizontal: spacing.sm }]}>
            {settings.lastSyncAt
              ? t('calendarSync.lastSync', {
                  date: `${formatCivilDateFull(settings.lastSyncAt, prefs.calendar, i18n.language)} ${localizeDigits(
                    new Date(settings.lastSyncAt).toTimeString().slice(0, 5),
                    i18n.language,
                  )}`,
                })
              : t('calendarSync.neverSynced')}
          </Text>
          {syncing ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} /> : null}
        </>
      ) : null}

      <AppAlertModal alert={alert} onClose={() => setAlert(null)} />
    </ScrollView>
  );
}
