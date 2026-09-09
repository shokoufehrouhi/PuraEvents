import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Section } from '../src/components/ui/Section';
import { usePreferences, useTheme } from '../src/theme/PreferencesContext';

// dayjs convention: 0 = Sunday, 1 = Monday, 6 = Saturday — same values the
// old inline SegmentedControl used, ordered Saturday/Sunday/Monday to match
// the approved mockup/original UI order.
const OPTIONS: { value: 0 | 1 | 6; labelKey: 'saturday' | 'sunday' | 'monday' }[] = [
  { value: 6, labelKey: 'saturday' },
  { value: 0, labelKey: 'sunday' },
  { value: 1, labelKey: 'monday' },
];

// Full push screen, same simple list+checkmark pattern as language-picker —
// per explicit request that every Preferences row should open "like
// Language" does, not a bottom sheet.
export default function FirstDayPickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const { prefs, setPrefs } = usePreferences();

  function pick(value: 0 | 1 | 6) {
    setPrefs({ firstDayOfWeek: value });
    router.back();
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Section>
        {OPTIONS.map(({ value, labelKey }) => {
          const selected = prefs.firstDayOfWeek === value;
          return (
            <Pressable key={value} onPress={() => pick(value)} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{t(`preferences.${labelKey}`)}</Text>
                {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </View>
            </Pressable>
          );
        })}
      </Section>
    </ScrollView>
  );
}
