import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, ScrollView, Text, View } from 'react-native';

import { adPrivacyOptionsRequired, showAdPrivacyOptions } from '../src/ads/mobileAdsInit';
import { AppAlertModal, type AppAlertState } from '../src/components/AppAlertModal';
import { ConfirmModal, type ConfirmModalState } from '../src/components/ConfirmModal';
import { DriveBackupSection } from '../src/components/DriveBackupSection';
import { ExportModal } from '../src/components/ExportModal';
import { Row } from '../src/components/ui/Row';
import { Section } from '../src/components/ui/Section';
import { scheduleRemindersForEvent } from '../src/notifications';
import { applyImportedEvents, listEvents } from '../src/storage/events';
import { usePro } from '../src/subscription';
import { usePreferences, useTheme } from '../src/theme/PreferencesContext';
import { rowBadgeColors } from '../src/theme/tokens';
import { formatCivilDateFull } from '../src/utils/calendars';
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

const LAST_EXPORT_KEY = 'puraevents:lastExport';

// Sub-screen for the Settings "Data & Privacy" menu row — moved out of the
// Settings tab's own inline Section per explicit request that each of its
// 4 top-level menus (Appearance/Notifications/Data & Privacy/About) drill
// into its own screen instead of showing sub-rows inline.
export default function DataPrivacyScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const { prefs } = usePreferences();
  const { isPro } = usePro();
  // When the user last exported a copy (save or share) — shown under the
  // rows so they can tell how old their own backup is.
  const [lastExport, setLastExport] = useState<string | null>(null);
  // Only where the ad consent rules apply (EEA/UK/CH): a way back into the
  // consent form, as Google's EU User Consent Policy requires.
  const [showAdPrivacy, setShowAdPrivacy] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(LAST_EXPORT_KEY).then(setLastExport, () => {});
    adPrivacyOptionsRequired().then(setShowAdPrivacy);
  }, []);
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
      const now = new Date().toISOString();
      AsyncStorage.setItem(LAST_EXPORT_KEY, now).catch(() => {});
      setLastExport(now);
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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Section>
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
        {showAdPrivacy ? (
          <Row
            icon="megaphone-outline"
            badgeColor={rowBadgeColors.orange}
            label={t('dataBackup.adPrivacyOptions')}
            onPress={() => showAdPrivacyOptions().catch(() => {})}
          />
        ) : null}
        <Row
          icon="shield-checkmark-outline"
          badgeColor={rowBadgeColors.green}
          label={t('settings.privacy')}
          onPress={() => router.push('/privacy')}
        />
      </Section>
      <Text style={[typography.caption, { color: colors.secondary, marginTop: -spacing.sm, marginHorizontal: spacing.sm }]}>
        {t(Platform.OS === 'ios' ? 'dataBackup.noteIos' : 'dataBackup.noteAndroid')}
      </Text>
      {isPro ? (
        <Text style={[typography.caption, { color: colors.secondary, marginTop: spacing.sm, marginHorizontal: spacing.sm }]}>
          {lastExport
            ? t('dataBackup.lastExport', { date: formatCivilDateFull(lastExport, prefs.calendar, i18n.language) })
            : t('dataBackup.neverExported')}
        </Text>
      ) : null}
      <DriveBackupSection />
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
