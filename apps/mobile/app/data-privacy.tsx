import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';

import { AppAlertModal, type AppAlertState } from '../src/components/AppAlertModal';
import { ConfirmModal, type ConfirmModalState } from '../src/components/ConfirmModal';
import { ExportModal } from '../src/components/ExportModal';
import { Row } from '../src/components/ui/Row';
import { Section } from '../src/components/ui/Section';
import { scheduleRemindersForEvent } from '../src/notifications';
import { applyImportedEvents, listEvents } from '../src/storage/events';
import { usePro } from '../src/subscription';
import { usePreferences, useTheme } from '../src/theme/PreferencesContext';
import { rowBadgeColors } from '../src/theme/tokens';
import { openDownloadsFolder } from '../modules/save-to-downloads';
import {
  exportEvents,
  ImportError,
  planImport,
  readImportFile,
  replaceWithImported,
  type ExportDestination,
  type ExportFormat,
  type ImportPlan,
} from '../src/utils/dataTransfer';

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
  const [confirm, setConfirm] = useState<ConfirmModalState | null>(null);
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
        setAlert({
          title: t('dataExport.savedTitle'),
          message: t('dataExport.savedMessage', { name: result.saved }),
          variant: 'success',
          action: { label: t('dataExport.showInFolder'), onPress: openDownloadsFolder },
        });
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

  // Writes the chosen outcome of an import and reports it. New events are
  // always added; conflicting ones are replaced only when the user said so.
  async function finishImport(plan: ImportPlan, replaceConflicts: boolean) {
    setBusy(true);
    try {
      const replaced = replaceConflicts ? plan.conflicts.map((c) => replaceWithImported(c.local, c.incoming)) : [];
      await applyImportedEvents(plan.fresh, replaced);
      await Promise.all([...plan.fresh, ...replaced].map((e) => scheduleRemindersForEvent(e, isPro, prefs.notificationsEnabled)));
      const lines = [
        plan.fresh.length ? t('dataImport.doneAdded', { count: plan.fresh.length }) : null,
        replaced.length ? t('dataImport.doneReplaced', { count: replaced.length }) : null,
        !replaceConflicts && plan.conflicts.length ? t('dataImport.doneKept', { count: plan.conflicts.length }) : null,
        plan.identical ? t('dataImport.doneIdentical', { count: plan.identical }) : null,
      ].filter(Boolean);
      setAlert({ title: t('dataImport.doneTitle'), message: lines.join('\n'), variant: 'success' });
    } catch (e) {
      setAlert({ title: t('dataImport.errorTitle'), message: (e as Error).message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  // No format question — readImportFile tells JSON and Excel apart from the
  // file itself. Events that exist here with different details are never
  // overwritten silently: the user picks "keep mine" or "replace".
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

    let plan: ImportPlan;
    setBusy(true);
    try {
      const incoming = await readImportFile(file.uri, file.name);
      if (!incoming.length) {
        setAlert({ title: t('dataImport.emptyTitle'), message: t('dataImport.emptyMessage'), variant: 'warning' });
        return;
      }
      plan = planImport(await listEvents(), incoming);
    } catch (e) {
      const reason = e instanceof ImportError ? e.message : 'invalidFile';
      setAlert({ title: t('dataImport.errorTitle'), message: t(`dataImport.${reason}`), variant: 'error' });
      return;
    } finally {
      setBusy(false);
    }

    if (!plan.conflicts.length) {
      await finishImport(plan, false);
      return;
    }
    const titles = plan.conflicts.slice(0, 3).map((c) => `• ${c.local.title}`).join('\n');
    const more = plan.conflicts.length > 3 ? `\n${t('dataImport.conflictMore', { count: plan.conflicts.length - 3 })}` : '';
    setConfirm({
      title: t('dataImport.conflictTitle', { count: plan.conflicts.length }),
      message: `${t('dataImport.conflictMessage')}\n\n${titles}${more}`,
      confirmLabel: t('dataImport.conflictReplace'),
      cancelLabel: t('dataImport.conflictKeep'),
      // Backs out of the whole import — nothing is added or changed.
      dismissLabel: t('manage.cancel'),
      warning: true,
      onConfirm: () => finishImport(plan, true),
      onCancel: () => finishImport(plan, false),
    });
  }

  // Same Pro gate as Import & Export above — Backup & Sync isn't built yet
  // either way (still a "coming soon" placeholder), but a free user still
  // sees the paywall first, not "coming soon", so the gate reads correctly
  // once this row is real.
  function handleBackupSync() {
    if (!isPro) {
      router.push('/upgrade');
      return;
    }
    Alert.alert(t('common.comingSoonTitle'), t('common.comingSoonMessage'));
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
      <ConfirmModal state={confirm} onClose={() => setConfirm(null)} />
      <AppAlertModal alert={alert} onClose={() => setAlert(null)} />
    </ScrollView>
  );
}
