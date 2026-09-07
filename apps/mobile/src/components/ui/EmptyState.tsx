import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../theme/PreferencesContext';

interface EmptyStateAction {
  kind: 'button' | 'link';
  label: string;
  onPress: () => void;
}

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  badgeIcon: keyof typeof Ionicons.glyphMap;
  badgeColor: string;
  title: string;
  subtitle: string;
  /** Omit when there's no obvious next step (e.g. the Day view's empty state). */
  action?: EmptyStateAction;
}

// Placeholder card for an empty list, per the "Compact holder" mockup: a
// soft primary-tinted card with a two-layer icon illustration (a big
// soft-circle badge + a small solid corner badge), bold title, secondary
// subtitle, and an optional next-step action (a "Create event" button on
// the Events tab's Upcoming empty state, a "View upcoming events" link on
// its Past empty state, no action at all on the Day view's empty state).
// Built from theme tokens/Ionicons rather than cropped mockup art so it
// stays theme-aware (light/dark) and mirrors correctly under RTL — the
// mockup's own callouts ("RTL ready", "Light + Dark ready") point the
// same direction a static raster illustration couldn't follow.
export function EmptyState({ icon, badgeIcon, badgeColor, title, subtitle, action }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <View
      style={[
        styles.box,
        {
          backgroundColor: `${colors.primary}0D`,
          borderColor: `${colors.primary}33`,
          borderRadius: radius.lg,
          padding: spacing.xl,
        },
      ]}
    >
      <View style={styles.illustration}>
        <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}1F` }]}>
          <Ionicons name={icon} size={38} color={colors.primary} />
        </View>
        <View style={[styles.badge, { backgroundColor: badgeColor, borderColor: colors.background }]}>
          <Ionicons name={badgeIcon} size={15} color="#FFFFFF" />
        </View>
      </View>
      <Text style={[typography.bodyStrong, styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[typography.caption, styles.subtitle, { color: colors.secondary }]}>{subtitle}</Text>
      {action?.kind === 'button' ? (
        <Pressable
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary, borderRadius: radius.pill, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Ionicons name="add" size={16} color="#FFFFFF" />
          <Text style={styles.buttonText}>{action.label}</Text>
        </Pressable>
      ) : action?.kind === 'link' ? (
        <Pressable onPress={action.onPress} hitSlop={8} style={{ marginTop: spacing.sm }}>
          <Text style={[typography.bodyStrong, { color: colors.primary }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', borderWidth: 1, marginTop: 32 },
  illustration: { marginBottom: 16 },
  iconCircle: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  subtitle: { textAlign: 'center', marginBottom: 16, paddingHorizontal: 8 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
