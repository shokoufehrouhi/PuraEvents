import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '../src/components/ui/Button';
import { Section } from '../src/components/ui/Section';
import { FREE_LIMITS, usePro } from '../src/subscription';
import { useTheme } from '../src/theme/PreferencesContext';
import { resolvePick } from '../src/utils/pickerBridge';
import { getActiveReminders, PRESET_REMINDER_OFFSETS, reminderLabel } from '../src/utils/reminders';

// Full push screen, same list+checkmark pattern as language-picker —
// multi-select though (Pro can pick more than one reminder), so a tap
// toggles instead of immediately resolving+popping back; "Done" below
// confirms the whole set at once, matching widget-picker's own
// stage-then-confirm flow for the same reason (see its own comment).
export default function ReminderPickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();
  const { isPro } = usePro();
  const { current } = useLocalSearchParams<{ current?: string }>();
  const [selected, setSelected] = useState<number[]>(() => {
    let parsed: number[] = [];
    try {
      parsed = current ? (JSON.parse(current) as number[]) : [];
    } catch {
      parsed = [];
    }
    // Seed with what's actually active, not the raw saved array — an
    // event edited after Pro lapsed would otherwise show every leftover
    // Pro-only offset pre-checked with no lock icon (isSelected skips the
    // lock check below), which reads as "still fully on" when it isn't.
    // Starting from the true active set means Done, even untouched,
    // persists the same downgrade the detail screen already shows.
    return getActiveReminders(parsed, isPro);
  });

  // Free plan doesn't get a free choice among the presets — only
  // FREE_LIMITS.freeReminderOffset ("1 day before") is ever selectable;
  // every other offset is Pro-only regardless of what's already picked
  // (see its own comment). Unchecking one already picked — even a
  // Pro-only offset left over from when Pro was active — always works.
  function toggle(offset: number) {
    const isSelected = selected.includes(offset);
    if (!isSelected && !isPro && offset !== FREE_LIMITS.freeReminderOffset) {
      router.push('/upgrade');
      return;
    }
    setSelected((s) => (isSelected ? s.filter((o) => o !== offset) : [...s, offset].sort((a, b) => a - b)));
  }

  function done() {
    resolvePick(JSON.stringify(selected));
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}>
        <Section>
          {PRESET_REMINDER_OFFSETS.map((offset) => {
            const isSelected = selected.includes(offset);
            const locked = !isSelected && !isPro && offset !== FREE_LIMITS.freeReminderOffset;
            return (
              <Pressable
                key={offset}
                onPress={() => toggle(offset)}
                style={{ padding: spacing.md, flexDirection: 'row', alignItems: 'center' }}
              >
                <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{reminderLabel(offset, t)}</Text>
                {locked ? <Ionicons name="lock-closed" size={16} color={colors.secondary} style={{ marginRight: 8 }} /> : null}
                {isSelected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </Section>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { padding: spacing.md, backgroundColor: colors.background, borderTopColor: colors.outline },
        ]}
      >
        <Button label={t('events.done')} onPress={done} style={{ borderRadius: radius.md }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth },
});
