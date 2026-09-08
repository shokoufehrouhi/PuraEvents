import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import dayjs from 'dayjs';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MiniWidget } from '../../src/components/MiniWidget';
import { Row } from '../../src/components/ui/Row';
import { Section } from '../../src/components/ui/Section';
import { listEvents } from '../../src/storage/events';
import { usePro } from '../../src/subscription';
import { useTheme } from '../../src/theme/PreferencesContext';
import { accents } from '../../src/theme/tokens';
import type { PurEvent } from '../../src/types/event';
import { darken } from '../../src/utils/color';

const SAMPLE_EVENT: PurEvent = {
  id: 'sample',
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

const THEME_SWATCHES: { key: string; colors: [string, string]; locked: boolean }[] = [
  { key: 'default', colors: [accents.violet, darken(accents.violet, 0.3)], locked: false },
  { key: 'sunset', colors: [accents.coral, accents.amber], locked: true },
  { key: 'forest', colors: [accents.mint, darken(accents.mint, 0.4)], locked: true },
  { key: 'midnight', colors: ['#171821', '#05050a'], locked: true },
];

export default function WidgetsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();
  const { isPro } = usePro();
  const [sample, setSample] = useState<PurEvent>(SAMPLE_EVENT);
  const [selectedTheme, setSelectedTheme] = useState('default');

  useFocusEffect(
    useCallback(() => {
      listEvents().then((events) => {
        const upcoming = events.find((e) => e.repeat !== 'none' || dayjs(e.dateTimeISO).isAfter(dayjs()));
        if (upcoming) setSample(upcoming);
      });
    }, [])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md }}>
        <Text style={[typography.title, { color: colors.text, marginBottom: spacing.lg }]}>{t('widgets.title')}</Text>

        <Text style={[typography.label, { color: colors.secondary, marginBottom: spacing.sm }]}>{t('widgets.widgetPreview')}</Text>
        <View style={[styles.previewRow, { marginBottom: spacing.lg }]}>
          <View style={styles.previewCol}>
            <MiniWidget event={sample} size="small" />
            <Text style={[typography.caption, { color: colors.secondary, marginTop: 6 }]}>{t('widgets.small')}</Text>
          </View>
          <View style={styles.previewCol}>
            <MiniWidget event={sample} size="medium" />
            <Text style={[typography.caption, { color: colors.secondary, marginTop: 6 }]}>{t('widgets.medium')}</Text>
          </View>
        </View>
        <View style={{ marginBottom: spacing.lg }}>
          <MiniWidget event={sample} size="large" />
          <Text style={[typography.caption, { color: colors.secondary, marginTop: 6 }]}>{t('widgets.large')}</Text>
        </View>

        <View style={styles.themesHeader}>
          <Text style={[typography.label, { color: colors.secondary }]}>{t('widgets.themes')}</Text>
          <Text style={[typography.caption, { color: colors.primary }]} onPress={() => router.push('/upgrade')}>
            {t('widgets.seeAll')}
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm, marginBottom: spacing.lg }}>
          {THEME_SWATCHES.map((theme) => {
            const locked = theme.locked && !isPro;
            const selected = selectedTheme === theme.key;
            return (
              <Pressable
                key={theme.key}
                onPress={() => (locked ? router.push('/upgrade') : setSelectedTheme(theme.key))}
                style={{ marginRight: spacing.sm }}
              >
                <LinearGradient
                  colors={theme.colors}
                  style={[
                    styles.themeSwatch,
                    { borderRadius: radius.md, borderWidth: selected ? 3 : 0, borderColor: colors.primary },
                  ]}
                >
                  {locked ? <Ionicons name="lock-closed" size={16} color="#fff" /> : null}
                </LinearGradient>
              </Pressable>
            );
          })}
        </ScrollView>

        <Section>
          <Row icon="color-palette-outline" label={t('widgets.accentColor')} value="●" onPress={() => router.push('/upgrade')} />
          <Row icon="square-outline" label={t('widgets.cornerStyle')} value={t('widgets.rounded')} onPress={() => router.push('/upgrade')} />
          <Row icon="text-outline" label={t('widgets.textStyle')} value={t('widgets.system')} onPress={() => router.push('/upgrade')} />
        </Section>

        {!isPro ? (
          <Text style={[typography.caption, { color: colors.secondary, marginTop: spacing.sm }]}>{t('widgets.proNote')}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  previewRow: { flexDirection: 'row', gap: 16 },
  previewCol: { alignItems: 'flex-start' },
  themesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  themeSwatch: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
});
