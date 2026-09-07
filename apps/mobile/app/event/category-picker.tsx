import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CATEGORY_BADGE_IMAGES } from '../../src/theme/categoryBadges';
import { getCategoryIcon } from '../../src/theme/icons';
import { useTheme } from '../../src/theme/PreferencesContext';
import type { EventCategory } from '../../src/types/event';
import { resolvePick } from '../../src/utils/pickerBridge';

const CATEGORIES: EventCategory[] = ['personal', 'work', 'travel', 'finance', 'health', 'other'];

// Full-screen category picker, opened from the "Category" row in the New
// Event Basics card (tap → this screen → tap a category → back). Category
// doubles as the icon — see src/theme/icons.ts.
export default function CategoryPickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();
  const { current } = useLocalSearchParams<{ current?: string }>();

  function pick(category: EventCategory) {
    resolvePick(category);
    router.back();
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { padding: spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[typography.bodyStrong, { color: colors.text }]}>{t('events.categoryLabel')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md }}>
        <View style={styles.list}>
          {CATEGORIES.map((c) => {
            const selected = current === c;
            const { color } = getCategoryIcon(c);
            return (
              <Pressable
                key={c}
                onPress={() => pick(c)}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: selected ? colors.primary : `${color}1F`, borderRadius: radius.lg, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Image source={CATEGORY_BADGE_IMAGES[c]} style={styles.badge} resizeMode="contain" />
                <Text style={[typography.bodyStrong, { color: selected ? colors.onPrimary : colors.text, flex: 1, marginLeft: 14, fontSize: 17 }]}>
                  {t(`events.category.${c}`)}
                </Text>
                {selected ? <Ionicons name="checkmark-circle" size={24} color={colors.onPrimary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  list: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14 },
  badge: { width: 44, height: 44 },
});
