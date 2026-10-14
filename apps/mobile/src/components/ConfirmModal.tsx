import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, Text, View } from 'react-native';

import { useTheme } from '../theme/PreferencesContext';
import { Button } from './ui/Button';

/** null hides the modal — same "controlled by the caller's own state"
 *  shape as AppAlertModal/NotificationDetailModal. `destructive` swaps
 *  the confirm button to the danger fill (e.g. a delete confirmation);
 *  `warning` adds AppAlertModal's warning badge above a centered title,
 *  for confirms that need the user to read a consequence first. */
export type ConfirmModalState = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  warning?: boolean;
  onConfirm: () => void;
};

interface Props {
  state: ConfirmModalState | null;
  onClose: () => void;
}

// An app-styled stand-in for Alert.alert's destructive-confirm pattern
// (e.g. Cancel/Delete) — same Modal/backdrop/card grammar as
// AppAlertModal.tsx, just with two real, caller-labeled actions instead
// of that one's single-or-Settings pair, since a plain OS Alert.alert
// doesn't match the rest of the app's look.
export function ConfirmModal({ state, onClose }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const warning = state?.warning;

  return (
    <Modal visible={!!state} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}
        onPress={onClose}
      >
        {/* Inner Pressable with a no-op onPress so tapping the card itself
            doesn't bubble to the backdrop's dismiss handler. */}
        <Pressable onPress={() => {}} style={{ width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }}>
          {warning ? (
            <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
              <Ionicons name="warning" size={44} color={colors.amber} />
            </View>
          ) : null}
          <Text style={[typography.headline, { color: colors.text, textAlign: warning ? 'center' : 'left' }]}>{state?.title}</Text>
          <Text style={[typography.body, { color: colors.secondary, marginTop: 8, textAlign: 'justify' }]}>{state?.message}</Text>
          <View style={{ flexDirection: 'row', marginTop: spacing.lg }}>
            <Button label={state?.cancelLabel ?? ''} variant="secondary" onPress={onClose} style={{ flex: 1, marginRight: 8 }} />
            <Button
              label={state?.confirmLabel ?? ''}
              variant={state?.destructive ? 'danger' : 'primary'}
              onPress={() => {
                onClose();
                state?.onConfirm();
              }}
              style={{ flex: 1, marginLeft: 8 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
