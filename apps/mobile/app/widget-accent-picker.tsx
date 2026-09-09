import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Section } from '../src/components/ui/Section';
import { useTheme } from '../src/theme/PreferencesContext';
import { ACCENT_KEYS, accents } from '../src/theme/tokens';
import { resolvePick } from '../src/utils/pickerBridge';

// Full push screen, same simple list+checkmark pattern as language-picker —
// same ACCENT_KEYS palette the wizard's own Accent Color field uses.
export default function WidgetAccentPickerScreen() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const { current } = useLocalSearchParams<{ current?: string }>();

  function pick(key: string) {
    resolvePick(key);
    router.back();
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Section>
        {ACCENT_KEYS.map((key) => {
          const selected = current === key;
          return (
            <Pressable key={key} onPress={() => pick(key)} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: accents[key], marginRight: 12 }} />
                <Text style={[typography.body, { color: colors.text, flex: 1, textTransform: 'capitalize' }]}>{key}</Text>
                {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </View>
            </Pressable>
          );
        })}
      </Section>
    </ScrollView>
  );
}
