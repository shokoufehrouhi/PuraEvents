import { Ionicons } from '@expo/vector-icons';
import type { ExpoCalendar } from 'expo-calendar';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';

import {
  calendarKey,
  ensureCalendarPermission,
  isTickedCalendar,
  forgetDeletedImports,
  removeImportedEvents,
  listImportableCalendars,
  loadCalendarSettings,
  removeExportCalendar,
  saveCalendarSettings,
  syncCalendars,
  type CalendarSyncSettings,
} from '../src/calendar/calendarSync';
import { loadDriveBackupState } from '../src/backup/driveBackup';
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
  // The Google account (connected for Drive backup) the list is narrowed to.
  const [account, setAccount] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [alert, setAlert] = useState<AppAlertState | null>(null);
  // Calendars ticked or unticked since the last sync — synced on leaving.
  const pendingSync = useRef(false);
  useEffect(
    () => () => {
      if (pendingSync.current) syncCalendars();
    },
    [],
  );

  useEffect(() => {
    loadCalendarSettings().then((s) => {
      setSettings(s);
      if (s.importEnabled) loadCalendars(s);
    });
  }, []);

  // Lists the calendars to pick from. Narrowed to the connected Google
  // account, calendars of other accounts ticked earlier are unticked (their
  // events go on the next sync).
  async function loadCalendars(current: CalendarSyncSettings) {
    const { email } = await loadDriveBackupState();
    const listed = await listImportableCalendars(email).catch(() => ({ calendars: [] as ExpoCalendar[], account: null }));
    setCalendars(listed.calendars);
    setAccount(listed.account);
    if (!listed.account) return;
    const shown = new Set(listed.calendars.map((c) => c.id));
    const ids = current.importCalendarIds.filter((id) => shown.has(id));
    if (ids.length === current.importCalendarIds.length) return;
    const keys = Object.fromEntries(Object.entries(current.importCalendarKeys).filter(([id]) => shown.has(id)));
    setSettings(await saveCalendarSettings({ importCalendarIds: ids, importCalendarKeys: keys }));
    pendingSync.current = true;
  }

  async function run() {
    pendingSync.current = false;
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
      await loadCalendars(await loadCalendarSettings());
      await run();
    } else {
      // Off takes the imported events out too; on brings them back.
      await removeImportedEvents();
    }
  }

  async function toggleCalendar(calendar: ExpoCalendar) {
    if (!settings) return;
    const { id } = calendar;
    const ticked = isTickedCalendar(settings, calendar);
    const ids = settings.importCalendarIds.filter((c) => c !== id);
    const keys = { ...settings.importCalendarKeys };
    delete keys[id];
    if (!ticked) {
      ids.push(id);
      keys[id] = calendarKey(calendar);
    }
    setSettings(await saveCalendarSettings({ importCalendarIds: ids, importCalendarKeys: keys }));
    // Not synced on every tap — a stray one while scrolling the list would
    // pull a whole calendar in at once. Changes sync when the screen closes
    // (below) or on "Sync now".
    pendingSync.current = true;
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
        {settings.importEnabled && account ? (
          <Text style={[typography.caption, { color: colors.secondary, paddingHorizontal: spacing.md, paddingTop: spacing.sm }]}>
            {t('calendarSync.accountCalendars', { email: account })}
          </Text>
        ) : null}
        {settings.importEnabled
          ? calendars.map((calendar) => {
              const selected = isTickedCalendar(settings, calendar);
              return (
                <Pressable
                  key={calendar.id}
                  onPress={() => toggleCalendar(calendar)}
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
