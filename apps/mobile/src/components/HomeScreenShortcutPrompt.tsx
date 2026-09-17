import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { isLikelyMiuiDevice, openHomeScreenShortcutPermissionSettings } from '../utils/miuiPermissions';
import { AppAlertModal } from './AppAlertModal';

// Shown once, ever, on first launch on a Xiaomi/Redmi/POCO device — asks
// the user to grant MIUI's own "Home screen shortcuts" permission (Security
// app → Permissions) *before* they ever hit the silent failure this same
// permission causes in requestPinWidgetForEvent (androidWidgetTask.tsx).
// There's no real API to *request* this permission the way a normal
// Android runtime permission works (no system dialog exists for it at
// all — MIUI only exposes it as a manual Security-app toggle, per
// openHomeScreenShortcutPermissionSettings's own comment), so the best
// this can do is proactively point the user at that screen instead of
// waiting for them to discover the problem by trying to add a widget.
const SHOWN_KEY = 'puraevents:homeScreenShortcutPromptShown';

export function HomeScreenShortcutPrompt() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isLikelyMiuiDevice()) return;
    AsyncStorage.getItem(SHOWN_KEY).then((shown) => {
      if (!shown) setVisible(true);
    });
  }, []);

  function dismiss() {
    setVisible(false);
    AsyncStorage.setItem(SHOWN_KEY, '1');
  }

  return (
    <AppAlertModal
      alert={
        visible
          ? {
              title: t('events.firstRunPermissionTitle'),
              message: t('events.firstRunPermissionMessage'),
              variant: 'warning',
              onSettings: openHomeScreenShortcutPermissionSettings,
            }
          : null
      }
      onClose={dismiss}
    />
  );
}
