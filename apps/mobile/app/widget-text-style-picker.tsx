import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Section } from '../src/components/ui/Section';
import { useTheme } from '../src/theme/PreferencesContext';
import { resolvePick } from '../src/utils/pickerBridge';

const OPTIONS = ['system', 'bold', 'black'] as const;

// Full push screen, same simple list+checkmark pattern as language-picker.
export default function WidgetTextStylePickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const { current } = useLocalSearchParams<{ current?: string }>();

  function pick(value: (typeof OPTIONS)[number]) {
    resolvePick(value);
    router.back();
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Section>
        {OPTIONS.map((value) => {
          const selected = current === value;
          return (
            <Pressable key={value} onPress={() => pick(value)} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{t(`widgets.${value}`)}</Text>
                {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </View>
            </Pressable>
          );
        })}
      </Section>
    </ScrollView>
  );
}
