import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, Text, View } from 'react-native';

import { useTheme } from '../theme/PreferencesContext';
import { Button } from './ui/Button';

export type ChoiceOption = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
};

/** null hides the modal — same "controlled by the caller's own state"
 *  shape as ConfirmModal/AppAlertModal. */
export type ChoiceModalState = {
  title: string;
  message?: string;
  options: ChoiceOption[];
  cancelLabel: string;
  onChoose: (key: string) => void;
};

interface Props {
  state: ChoiceModalState | null;
  onClose: () => void;
}

// An app-styled "pick one of these" sheet — same Modal/backdrop/card
// grammar as ConfirmModal, but with a tappable row per option (icon,
// label, one-line description) instead of two fixed buttons.
export function ChoiceModal({ state, onClose }: Props) {
  const { colors, radius, spacing, typography } = useTheme();

  return (
    <Modal visible={!!state} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}} style={{ width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }}>
          <Text style={[typography.headline, { color: colors.text }]}>{state?.title}</Text>
          {state?.message ? (
            <Text style={[typography.body, { color: colors.secondary, marginTop: 8 }]}>{state.message}</Text>
          ) : null}
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {state?.options.map((option) => (
              <Pressable
                key={option.key}
                onPress={() => {
                  onClose();
                  state.onChoose(option.key);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: spacing.sm,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.outline,
                  backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
                })}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.surfaceAlt,
                  }}
                >
                  <Ionicons name={option.icon} size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>{option.label}</Text>
                  <Text style={[typography.caption, { color: colors.secondary, marginTop: 2 }]}>{option.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
              </Pressable>
            ))}
          </View>
          <Button label={state?.cancelLabel ?? ''} variant="secondary" onPress={onClose} style={{ marginTop: spacing.md }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
