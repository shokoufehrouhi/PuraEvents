import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EventHeroCard } from '../src/components/EventHeroCard';
import { Button } from '../src/components/ui/Button';
import { useTheme } from '../src/theme/PreferencesContext';
import { FREE_LIMITS } from '../src/subscription';
import type { PurEvent } from '../src/types/event';

const PREVIEW_EVENT: PurEvent = {
  id: 'preview',
  title: 'Tokyo Trip',
  dateTimeISO: new Date(Date.now() + 18 * 86400000 + 6 * 3600000 + 24 * 60000).toISOString(),
  timezone: 'Asia/Tokyo',
  category: 'travel',
  accentColor: 'coral',
  cardTheme: 'color',
  repeat: 'none',
  reminders: [],
  createdAt: '',
  updatedAt: '',
};

function ComparisonRow({ label, free, pro }: { label: string; free: string; pro: string }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={[styles.compareRow, { paddingVertical: spacing.sm, borderColor: colors.outline }]}>
      <Text style={[typography.body, { color: colors.text, flex: 1.4 }]}>{label}</Text>
      <Text style={[typography.body, { color: colors.secondary, flex: 1, textAlign: 'right' }]}>{free}</Text>
      <Text style={[typography.bodyStrong, { color: colors.primary, flex: 1, textAlign: 'right' }]}>{pro}</Text>
    </View>
  );
}

// PuraEvents Pro comparison + purchase screen. RevenueCat isn't wired yet
// (Phase 3, docs/PROJECT.md §5.1/§9) — Continue is a real, honest placeholder.
export default function UpgradeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();

  const rows: [string, string, string][] = [
    [t('compare.activeEvents'), String(FREE_LIMITS.maxActiveEvents), t('compare.unlimited')],
    [t('compare.widgets'), '1 size', t('widgets.small') + ' + ' + t('widgets.large')],
    [t('compare.reminders'), String(FREE_LIMITS.maxRemindersPerEvent), t('compare.unlimited')],
    [t('compare.customThemes'), '—', '✓'],
    [t('compare.cloudSync'), '—', '✓'],
    [t('compare.sharedEvents'), '—', '✓'],
    [t('compare.ads'), t('compare.yes'), t('compare.no')],
  ];

  function handleContinue() {
    Alert.alert('Not wired up yet', 'Purchases go live once RevenueCat is integrated (Phase 3).');
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <EventHeroCard event={PREVIEW_EVENT} height={110} />

      <Text style={[typography.headline, { color: colors.text, marginTop: spacing.lg }]}>{t('compare.subtitle')}</Text>

      <View style={[styles.table, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md }]}>
        <View style={styles.compareHeader}>
          <Text style={{ flex: 1.4 }} />
          <Text style={[typography.label, { color: colors.secondary, flex: 1, textAlign: 'right' }]}>{t('compare.free')}</Text>
          <Text style={[typography.label, { color: colors.primary, flex: 1, textAlign: 'right' }]}>{t('compare.pro')}</Text>
        </View>
        {rows.map(([label, free, pro]) => (
          <ComparisonRow key={label} label={label} free={free} pro={pro} />
        ))}
      </View>

      <View
        style={[
          styles.planCard,
          {
            borderColor: colors.primary,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            padding: spacing.md,
            marginTop: spacing.lg,
          },
        ]}
      >
        <View style={styles.planRow}>
          <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
          <View style={{ marginLeft: spacing.sm, flex: 1 }}>
            <View style={styles.planTitleRow}>
              <Text style={[typography.bodyStrong, { color: colors.text }]}>{t('paywall.yearly')}</Text>
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={[typography.caption, { color: colors.onPrimary }]}>{t('paywall.bestValue')}</Text>
              </View>
            </View>
            <Text style={[typography.caption, { color: colors.secondary }]}>7-day free trial · $1.25/month</Text>
          </View>
          <Text style={[typography.bodyStrong, { color: colors.text }]}>$14.99{t('paywall.perYear')}</Text>
        </View>
      </View>

      <Button label={t('paywall.continue')} onPress={handleContinue} style={{ marginTop: spacing.lg }} />
      <Button label={t('paywall.maybeLater')} variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.sm }} />

      <Text style={[typography.caption, { color: colors.secondary, textAlign: 'center', marginTop: spacing.md }]}>
        {t('paywall.autoRenewNote')}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  table: {},
  compareHeader: { flexDirection: 'row', marginBottom: 4 },
  compareRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  planCard: { borderWidth: 2 },
  planRow: { flexDirection: 'row', alignItems: 'center' },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
});
