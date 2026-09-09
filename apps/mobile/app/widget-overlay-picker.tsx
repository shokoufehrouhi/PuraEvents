import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Section } from '../src/components/ui/Section';
import { useTheme } from '../src/theme/PreferencesContext';
import { resolvePick } from '../src/utils/pickerBridge';

const OPTIONS = [0, 15, 35, 50, 70];

// Full push screen, same simple list+checkmark pattern as language-picker.
// Values are the dark-scrim opacity (%) drawn over a custom widget's photo.
export default function WidgetOverlayPickerScreen() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const { current } = useLocalSearchParams<{ current?: string }>();
  const currentValue = current ? Number(current) : 35;

  function pick(value: number) {
    resolvePick(String(value));
    router.back();
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Section>
        {OPTIONS.map((value) => {
          const selected = currentValue === value;
          return (
            <Pressable key={value} onPress={() => pick(value)} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{value}%</Text>
                {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </View>
            </Pressable>
          );
        })}
      </Section>
    </ScrollView>
  );
}
