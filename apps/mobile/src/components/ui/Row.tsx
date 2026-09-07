import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useTheme } from '../../theme/PreferencesContext';
import { minTapTarget } from '../../theme/tokens';

interface BaseProps {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  iconColor?: string;
  // Background for a solid colored square behind the icon ("color by
  // function" — see Settings/Preferences mockup). Omit to fall back to a
  // small plain icon (pre-existing look), e.g. for rows without a strong
  // functional color.
  badgeColor?: string;
}

interface NavRowProps extends BaseProps {
  type?: 'nav';
  value?: string;
  // Optional so a row can show a value read-only (no chevron, not
  // tappable) — e.g. Preferences' "Current timezone" row while "Automatic
  // timezone" is on.
  onPress?: () => void;
}

interface SwitchRowProps extends BaseProps {
  type: 'switch';
  value: boolean;
  onValueChange: (v: boolean) => void;
}

type Props = NavRowProps | SwitchRowProps;

// A single settings-style row: icon + label, with either a value/chevron
// (navigates) or a switch on the trailing edge. Matches the Settings /
// Preferences mockups.
export function Row(props: Props) {
  const { colors, radius, spacing, typography } = useTheme();

  const content = (
    <View style={[styles.row, { paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.md }]}>
      {props.icon && props.badgeColor ? (
        <View style={[styles.badge, { backgroundColor: props.badgeColor, borderRadius: radius.sm }]}>
          <Ionicons name={props.icon} size={16} color="#FFFFFF" />
        </View>
      ) : props.icon ? (
        <Ionicons name={props.icon} size={20} color={props.iconColor ?? colors.secondary} style={styles.icon} />
      ) : null}
      <Text style={[typography.body, { color: colors.text, flex: 1, marginLeft: props.badgeColor ? spacing.sm + 2 : 0 }]}>
        {props.label}
      </Text>
      {props.type === 'switch' ? (
        <Switch value={props.value} onValueChange={props.onValueChange} trackColor={{ true: colors.primary }} />
      ) : (
        <>
          {props.value ? (
            <Text style={[typography.body, { color: colors.secondary, marginRight: spacing.xs }]}>{props.value}</Text>
          ) : null}
          {props.onPress ? <Ionicons name="chevron-forward" size={18} color={colors.outline} /> : null}
        </>
      )}
    </View>
  );

  if (props.type === 'switch') return content;
  if (!props.onPress) return content;

  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, minHeight: minTapTarget }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 26 },
  badge: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
