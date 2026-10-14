import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';

import { AppAlertModal, type AppAlertState } from '../src/components/AppAlertModal';
import { ExportModal } from '../src/components/ExportModal';
import { Row } from '../src/components/ui/Row';
import { Section } from '../src/components/ui/Section';
import { scheduleRemindersForEvent } from '../src/notifications';
import { importEventRecords, listEvents } from '../src/storage/events';
import { usePro } from '../src/subscription';
import { usePreferences, useTheme } from '../src/theme/PreferencesContext';
import { rowBadgeColors } from '../src/theme/tokens';
import { exportEvents, ImportError, readImportFile, type ExportDestination, type ExportFormat } from '../src/utils/dataTransfer';

function comingSoon() {
  Alert.alert('Coming soon', 'This will be available in a later release.');
}

// Sub-screen for the Settings "Data & Privacy" menu row — moved out of the
// Settings tab's own inline Section per explicit request that each of its
// 4 top-level menus (Appearance/Notifications/Data & Privacy/About) drill
// into its own screen instead of showing sub-rows inline.
export default function DataPrivacyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { prefs } = usePreferences();
  const { isPro } = usePro();
  const [exportOpen, setExportOpen] = useState(false);
  const [alert, setAlert] = useState<AppAlertState | null>(null);
  const [busy, setBusy] = useState(false);

  // Export/Import are Pro-only, per explicit request — a free user sees the
  // rows (with a "Pro" trailing badge) and tapping one routes to the
  // paywall, same tappable-not-disabled pattern as the event-detail Share
  // button's own gate.
  async function runExport(format: ExportFormat, destination: ExportDestination) {
    const events = await listEvents();
    if (!events.length) {
      setAlert({ title: t('dataExport.nothingTitle'), message: t('dataExport.nothingMessage'), variant: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const result = await exportEvents(events, format, destination, t);
      if ('saved' in result) {
        setAlert({ title: t('dataExport.savedTitle'), message: t('dataExport.savedMessage', { name: result.saved }), variant: 'success' });
      }
    } catch (e) {
      setAlert({ title: t('dataExport.errorTitle'), message: (e as Error).message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  // One sheet asks for both the format and save-vs-share (see ExportModal).
  function handleExport() {
    if (!isPro) {
      router.push('/upgrade');
      return;
    }
    setExportOpen(true);
  }

  // No format question here — readImportFile tells JSON and Excel apart
  // from the picked file itself. Existing events are never overwritten
  // (see importEventRecords); imported ones get their reminders scheduled.
  async function handleImport() {
    if (!isPro) {
      router.push('/upgrade');
      return;
    }
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '*/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const file = picked.assets[0];

    setBusy(true);
    try {
      const incoming = await readImportFile(file.uri, file.name);
      if (!incoming.length) {
        setAlert({ title: t('dataImport.emptyTitle'), message: t('dataImport.emptyMessage'), variant: 'warning' });
        return;
      }
      const { added, skipped } = await importEventRecords(incoming);
      await Promise.all(added.map((event) => scheduleRemindersForEvent(event, isPro, prefs.notificationsEnabled)));
      setAlert({
        title: t('dataImport.doneTitle'),
        message:
          t('dataImport.doneAdded', { count: added.length }) + (skipped ? `\n${t('dataImport.doneSkipped', { count: skipped })}` : ''),
        variant: 'success',
      });
    } catch (e) {
      const reason = e instanceof ImportError ? e.message : 'invalidFile';
      setAlert({ title: t('dataImport.errorTitle'), message: t(`dataImport.${reason}`), variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  // Same Pro gate as Import & Export above — Backup & Sync isn't built yet
  // either way (still the comingSoon() placeholder), but a free user still
  // sees the paywall first, not "coming soon", so the gate reads correctly
  // once this row is real.
  function handleBackupSync() {
    if (!isPro) {
      router.push('/upgrade');
      return;
    }
    comingSoon();
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Section>
        <Row
          icon="cloud-outline"
          badgeColor={rowBadgeColors.blue}
          label={t('settings.backupSync')}
          value={isPro ? t('settings.onThisDevice') : t('settings.proOnly')}
          onPress={handleBackupSync}
        />
        <Row
          icon="share-outline"
          badgeColor={rowBadgeColors.purple}
          label={t('dataExport.rowLabel')}
          value={isPro ? undefined : t('settings.proOnly')}
          onPress={busy ? undefined : handleExport}
        />
        <Row
          icon="download-outline"
          badgeColor={rowBadgeColors.purple}
          label={t('dataImport.rowLabel')}
          value={isPro ? undefined : t('settings.proOnly')}
          onPress={busy ? undefined : handleImport}
        />
        <Row
          icon="shield-checkmark-outline"
          badgeColor={rowBadgeColors.green}
          label={t('settings.privacy')}
          onPress={() => router.push('/privacy')}
        />
      </Section>
      {busy ? (
        <View style={{ marginTop: spacing.lg, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
      <ExportModal visible={exportOpen} onClose={() => setExportOpen(false)} onExport={runExport} />
      <AppAlertModal alert={alert} onClose={() => setAlert(null)} />
    </ScrollView>
  );
}
