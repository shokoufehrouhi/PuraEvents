import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Section } from '../src/components/ui/Section';
import { usePreferences, useTheme } from '../src/theme/PreferencesContext';
import type { TimeFormat } from '../src/storage/preferences';

const OPTIONS: TimeFormat[] = ['12h', '24h'];

// Full push screen, same simple list+checkmark pattern as language-picker —
// per explicit request that every Preferences row should open "like
// Language" does, not a bottom sheet.
export default function TimeFormatPickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const { prefs, setPrefs } = usePreferences();

  function pick(value: TimeFormat) {
    setPrefs({ timeFormat: value });
    router.back();
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Section>
        {OPTIONS.map((value) => {
          const selected = prefs.timeFormat === value;
          return (
            <Pressable key={value} onPress={() => pick(value)} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{t(`preferences.${value}`)}</Text>
                {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </View>
            </Pressable>
          );
        })}
      </Section>
    </ScrollView>
  );
}
