import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Section } from '../src/components/ui/Section';
import { useTheme } from '../src/theme/PreferencesContext';
import { resolvePick } from '../src/utils/pickerBridge';
import { TIMEZONE_GROUPS } from '../src/utils/timezones';

// Full-screen manual-timezone picker, opened from Preferences' "Current
// timezone" row only while "Automatic timezone" is off (that row is a
// read-only display, not a picker, while automatic is on — see
// preferences.tsx). Curated regional list, not the full IANA set — see
// utils/timezones.ts for why.
export default function TimezonePickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();
  const { current } = useLocalSearchParams<{ current?: string }>();
  const [query, setQuery] = useState('');

  function pick(id: string) {
    resolvePick(id);
    router.back();
  }

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TIMEZONE_GROUPS;
    return TIMEZONE_GROUPS.map((g) => ({
      ...g,
      zones: g.zones.filter((z) => z.city.toLowerCase().includes(q) || z.id.toLowerCase().includes(q)),
    })).filter((g) => g.zones.length > 0);
  }, [query]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.md }}>
        <View style={[styles.searchField, { borderColor: colors.outline, borderRadius: radius.md }]}>
          <Ionicons name="search" size={18} color={colors.secondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('preferences.searchTimezone')}
            placeholderTextColor={colors.secondary}
            style={[typography.body, { color: colors.text, flex: 1, marginLeft: 8 }]}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, paddingTop: 0 }}>
        {groups.map((g) => (
          <Section key={g.region} title={g.region}>
            {g.zones.map((z) => {
              const selected = current === z.id;
              return (
                <Pressable
                  key={z.id}
                  onPress={() => pick(z.id)}
                  style={({ pressed }) => [styles.row, { padding: spacing.md, opacity: pressed ? 0.7 : 1 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.body, { color: colors.text }]}>{z.city}</Text>
                    <Text style={[typography.caption, { color: colors.secondary }]}>{z.id}</Text>
                  </View>
                  {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </Section>
        ))}
        {groups.length === 0 ? (
          <Text style={[typography.body, { color: colors.secondary, textAlign: 'center', marginTop: spacing.lg }]}>
            {t('preferences.noTimezoneMatch')}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  searchField: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
