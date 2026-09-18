import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Section } from '../src/components/ui/Section';
import { usePreferences, useTheme } from '../src/theme/PreferencesContext';
import type { AppearanceMode } from '../src/storage/preferences';

const OPTIONS: AppearanceMode[] = ['system', 'light', 'dark'];

// Full push screen, same simple list+checkmark pattern as language-picker —
// per explicit request that every Preferences row should open "like
// Language" does, not a bottom sheet.
export default function ThemePickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const { prefs, setPrefs } = usePreferences();

  function pick(value: AppearanceMode) {
    setPrefs({ appearance: value });
    // Deferred one frame, not called synchronously right after setPrefs —
    // appearance is the one preference that recolors every screen's own
    // headerStyle/contentStyle at once (via useTheme's colors, read all
    // through app/_layout.tsx's Stack), and popping mid-way through that
    // whole-stack re-render races react-native-screens' own fragment
    // transaction, crashing with "ScreenStackFragment added into a
    // non-stack container" (reproduced live switching Dark -> Light).
    // Letting the recolor commit and paint first avoids the race.
    requestAnimationFrame(() => router.back());
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Section>
        {OPTIONS.map((value) => {
          const selected = prefs.appearance === value;
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
