import { statusCodes } from '@react-native-google-signin/google-signin';
import { reloadAppAsync } from 'expo';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Text, View } from 'react-native';

import {
  backUpNow,
  connectGoogleAccount,
  disconnectGoogleAccount,
  DriveBackupError,
  findRemoteBackup,
  loadDriveBackupState,
  restoreFromDrive,
  setAutoBackup,
  type DriveBackupState,
} from '../backup/driveBackup';
import { usePro } from '../subscription';
import { usePreferences, useTheme } from '../theme/PreferencesContext';
import { rowBadgeColors } from '../theme/tokens';
import { formatCivilDateFull } from '../utils/calendars';
import { AppAlertModal, type AppAlertState } from './AppAlertModal';
import { AppSplash } from './AppSplash';
import { ConfirmModal, type ConfirmModalState } from './ConfirmModal';
import { Row } from './ui/Row';
import { Section } from './ui/Section';

// Data & Privacy's "Google Drive backup" block (see backup/driveBackup.ts).
// Connecting and restoring are open to everyone, so a backup made while on
// Pro can always be brought back; making backups is the Pro part.
export function DriveBackupSection() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const { prefs } = usePreferences();
  const { isPro } = usePro();
  const [state, setState] = useState<DriveBackupState | null>(null);
  const [busy, setBusy] = useState(false);
  // Restore replaces everything and reloads the app — the splash covers
  // the whole time, from the download until the reloaded app is drawn.
  const [restoring, setRestoring] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmModalState | null>(null);
  const [alert, setAlert] = useState<AppAlertState | null>(null);

  useEffect(() => {
    loadDriveBackupState().then(setState);
  }, []);

  const date = (iso: string) => formatCivilDateFull(iso, prefs.calendar, i18n.language);

  function showError(e: unknown) {
    let message = t('driveBackup.errorNetwork');
    if (e instanceof DriveBackupError) {
      if (e.reason === 'cancelled') return;
      if (e.reason === 'noBackup') message = t('driveBackup.errorNoBackup');
      if (e.reason === 'invalid') message = t('driveBackup.errorInvalid');
    } else if (e && typeof e === 'object' && 'code' in e) {
      // Google sign-in's own errors; closing the account picker isn't one.
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return;
      // 7 is Google Play services' NETWORK_ERROR: no connection.
      message = String(e.code) === '7' ? t('driveBackup.errorNetwork') : t('driveBackup.errorSignIn', { code: String(e.code) });
    }
    setAlert({ title: t('driveBackup.errorTitle'), message, variant: 'error' });
  }

  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    try {
      return await work();
    } catch (e) {
      showError(e);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function backUp() {
    if (!isPro) {
      router.push('/upgrade');
      return;
    }
    const next = await run(backUpNow);
    if (next) {
      setState(next);
      setAlert({ title: t('driveBackup.doneTitle'), message: t('driveBackup.doneMessage'), variant: 'success' });
    }
  }

  function askRestore(backupDate: string) {
    setConfirm({
      title: t('driveBackup.restoreTitle'),
      message: t('driveBackup.restoreMessage', { date: date(backupDate) }),
      confirmLabel: t('driveBackup.restoreAction'),
      cancelLabel: t('manage.cancel'),
      warning: true,
      onConfirm: async () => {
        setRestoring(true);
        const ok = await run(async () => {
          await restoreFromDrive();
          return true;
        });
        if (!ok) setRestoring(false);
        // Every screen, reminder and the widget start over from the
        // restored data — and in the restored language.
        if (ok) await reloadAppAsync('Restored from Google Drive');
      },
    });
  }

  async function restore() {
    const backupDate = await run(findRemoteBackup);
    if (backupDate === undefined) return;
    if (!backupDate) {
      showError(new DriveBackupError('noBackup'));
      return;
    }
    askRestore(backupDate);
  }

  async function connect() {
    const next = await run(connectGoogleAccount);
    if (!next) return;
    setState(next);
    // A backup already in this account (another phone, or before clearing
    // the app's data) is the likely reason to connect — offer it first.
    const backupDate = await run(findRemoteBackup);
    if (backupDate) {
      askRestore(backupDate);
    } else if (isPro && backupDate === null) {
      await backUp();
    }
  }

  function disconnect() {
    setConfirm({
      title: t('driveBackup.disconnectTitle'),
      message: t('driveBackup.disconnectMessage'),
      confirmLabel: t('driveBackup.disconnect'),
      cancelLabel: t('manage.cancel'),
      destructive: true,
      onConfirm: async () => {
        const next = await run(disconnectGoogleAccount);
        if (next) setState(next);
      },
    });
  }

  async function toggleAuto(on: boolean) {
    if (!isPro) {
      router.push('/upgrade');
      return;
    }
    setState(await setAutoBackup(on));
  }

  if (!state) return null;

  return (
    <View style={{ marginTop: spacing.lg }}>
      <Section title={t('driveBackup.title')}>
        {state.email ? (
          <>
            <Row
              icon="cloud-upload-outline"
              badgeColor={rowBadgeColors.blue}
              label={t('driveBackup.backUpNow')}
              value={isPro ? undefined : t('settings.proOnly')}
              onPress={busy ? undefined : backUp}
            />
            <Row
              icon="cloud-download-outline"
              badgeColor={rowBadgeColors.blue}
              label={t('driveBackup.restore')}
              onPress={busy ? undefined : restore}
            />
            {isPro ? (
              <Row
                type="switch"
                icon="sync-outline"
                badgeColor={rowBadgeColors.green}
                label={t('driveBackup.auto')}
                value={state.autoBackup}
                onValueChange={toggleAuto}
              />
            ) : null}
            <Row
              icon="person-circle-outline"
              badgeColor={rowBadgeColors.purple}
              label={t('driveBackup.account')}
              value={state.email}
              onPress={busy ? undefined : disconnect}
            />
          </>
        ) : (
          <Row
            icon="logo-google"
            badgeColor={rowBadgeColors.blue}
            label={t('driveBackup.connect')}
            onPress={busy ? undefined : connect}
          />
        )}
      </Section>
      <Text style={[typography.caption, { color: colors.secondary, marginTop: -spacing.sm, marginHorizontal: spacing.sm }]}>
        {state.email
          ? state.lastBackupAt
            ? t('driveBackup.lastBackup', { date: date(state.lastBackupAt) })
            : t('driveBackup.noBackupYet')
          : t('driveBackup.note')}
      </Text>
      {busy ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} /> : null}
      <Modal visible={restoring} animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
        <AppSplash />
      </Modal>
      <ConfirmModal state={confirm} onClose={() => setConfirm(null)} />
      <AppAlertModal alert={alert} onClose={() => setAlert(null)} />
    </View>
  );
}
