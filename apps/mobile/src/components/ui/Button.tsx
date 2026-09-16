import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme/PreferencesContext';
import { minTapTarget } from '../../theme/tokens';

interface Props {
  label: string;
  onPress: () => void;
  // 'dangerOutline' — same outline look as 'secondary', just with red
  // label text — for a destructive action sitting next to a non-
  // destructive one where a solid red fill would be too loud (see the
  // event Detail screen's Edit/Delete pair).
  variant?: 'primary' | 'secondary' | 'danger' | 'dangerOutline';
  disabled?: boolean;
  // Swaps the label for a spinner and forces disabled — for an action with
  // a real in-flight wait (e.g. an OS prompt/promise), as opposed to
  // `disabled` alone, which gives no feedback that something is happening.
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Primary/secondary/danger button with pressed + disabled states, matching
// the design system's COMPONENTS/STATES tokens.
export function Button({ label, onPress, variant = 'primary', disabled, loading, style }: Props) {
  const { colors, radius, spacing, typography } = useTheme();

  const outlined = variant === 'secondary' || variant === 'dangerOutline';
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : 'transparent';
  const border = outlined ? colors.outline : 'transparent';
  const textColor = variant === 'dangerOutline' ? colors.danger : outlined ? colors.text : colors.onPrimary;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: outlined ? StyleSheet.hairlineWidth * 2 : 0,
          borderRadius: radius.md,
          paddingVertical: spacing.md - 2,
          opacity: isDisabled ? 0.4 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : <Text style={[styles.label, typography.bodyStrong, { color: textColor }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {},
});
