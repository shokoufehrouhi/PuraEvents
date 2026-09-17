import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../theme/PreferencesContext';
import { Button } from './ui/Button';

type Variant = 'success' | 'error' | 'warning';

/** `onSettings`, when set, adds a second button (e.g. "Settings" alongside
 *  "Done") — see its own callers for why (MIUI's silently-blocked
 *  widget-pin permission has no in-app fix, only a device Settings
 *  toggle). `variant` picks the icon badge above the title — glanceable
 *  status, not just title wording. */
export type AppAlertState = { title: string; message: string; variant?: Variant; onSettings?: () => void };

interface Props {
  /** null hides the modal — same "controlled by the caller's own state"
   *  shape as NotificationDetailModal. */
  alert: AppAlertState | null;
  onClose: () => void;
}

const VARIANT_ICON: Record<Variant, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'close-circle',
  warning: 'warning',
};

// An app-styled stand-in for Alert.alert (a plain OS dialog that doesn't
// match the rest of the app's look) — same Modal/backdrop/card pattern as
// NotificationDetailModal.tsx, just with a generic title+message body
// instead of that one's fixed notification fields.
export function AppAlertModal({ alert, onClose }: Props) {
  const { t } = useTranslation();
  const { colors, radius, spacing, typography } = useTheme();
  const variant = alert?.variant;
  const iconColor = variant === 'success' ? colors.mint : variant === 'warning' ? colors.amber : colors.danger;

  return (
    <Modal visible={!!alert} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}
        onPress={onClose}
      >
        {/* Inner Pressable with a no-op onPress so tapping the card itself
            doesn't bubble to the backdrop's dismiss handler. */}
        <Pressable onPress={() => {}} style={{ width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }}>
          {variant ? (
            <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
              <Ionicons name={VARIANT_ICON[variant]} size={44} color={iconColor} />
            </View>
          ) : null}
          <Text style={[typography.headline, { color: colors.text, textAlign: variant ? 'center' : 'left' }]}>{alert?.title}</Text>
          <Text style={[typography.body, { color: colors.secondary, marginTop: 8, textAlign: 'justify' }]}>
            {alert?.message}
          </Text>
          <View style={{ flexDirection: 'row', marginTop: spacing.lg }}>
            {alert?.onSettings ? (
              <Button
                label={t('events.done')}
                variant="secondary"
                onPress={onClose}
                style={{ flex: 1, marginRight: 8 }}
              />
            ) : null}
            <Button
              label={alert?.onSettings ? t('events.openSettings') : t('events.done')}
              onPress={() => {
                onClose();
                alert?.onSettings?.();
              }}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
