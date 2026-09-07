import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeroCountdown } from '../../../src/components/HeroCountdown';
import { Button } from '../../../src/components/ui/Button';
import { Section } from '../../../src/components/ui/Section';
import { cancelRemindersForEvent } from '../../../src/notifications';
import { deleteEvent, getEvent } from '../../../src/storage/events';
import { getCategoryIcon } from '../../../src/theme/icons';
import { usePreferences, useTheme } from '../../../src/theme/PreferencesContext';
import type { PurEvent } from '../../../src/types/event';
import { formatCivilDateFull, shouldUseFarsiDigits } from '../../../src/utils/calendars';
import { getNextOccurrence } from '../../../src/utils/recurrence';
import { reminderLabel } from '../../../src/utils/reminders';

// A single "EVENT DETAILS"/"REMINDER" row: icon badge + two-line text +
// chevron. All of them route to the edit screen — this app has no separate
// per-field editor, so tapping any detail opens the one place they're all
// actually editable.
function DetailRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.detailRow, { padding: spacing.md, opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={[styles.detailBadge, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}>
        <Ionicons name={icon} size={20} color={colors.text} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[typography.bodyStrong, { color: colors.text }]}>{label}</Text>
        <Text style={[typography.caption, { color: colors.secondary, marginTop: 2 }]}>{value}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.outline} />
    </Pressable>
  );
}

export default function EventDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();
  const { prefs } = usePreferences();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<PurEvent | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (id) getEvent(id).then((e) => setEvent(e ?? null));
    }, [id])
  );

  if (!event) return null;

  async function handleDelete() {
    Alert.alert(t('events.delete'), event!.title, [
      { text: t('events.back'), style: 'cancel' },
      {
        text: t('events.delete'),
        style: 'destructive',
        onPress: async () => {
          await cancelRemindersForEvent(event!.id);
          await deleteEvent(event!.id);
          router.back();
        },
      },
    ]);
  }

  async function handleShare() {
    await Share.share({
      message: `${event!.title} — ${getNextOccurrence(event!.dateTimeISO, event!.repeat).format('YYYY-MM-DD HH:mm')}`,
    });
  }

  function goEdit() {
    router.push(`/event/${event!.id}/edit`);
  }

  const useFarsiDigits = shouldUseFarsiDigits(i18n.language);
  const { color: categoryColor, image: categoryImage } = getCategoryIcon(event.category);
  const nextOccurrence = getNextOccurrence(event.dateTimeISO, event.repeat);
  const timeString = nextOccurrence.format(prefs.timeFormat === '12h' ? 'h:mm A' : 'HH:mm');
  const dateTimeValue = `${formatCivilDateFull(nextOccurrence.toISOString(), prefs.calendar, useFarsiDigits)} · ${timeString}`;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingHorizontal: spacing.md }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={[styles.headerButton, { backgroundColor: colors.surfaceAlt }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerRight}>
          <Pressable onPress={goEdit} hitSlop={12} style={[styles.headerButton, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="create-outline" size={20} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={handleDelete}
            hitSlop={12}
            style={[styles.headerButton, { backgroundColor: colors.surfaceAlt, marginLeft: 12 }]}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md }}>
        <View style={styles.titleRow}>
          <Image source={categoryImage} style={styles.categoryImage} resizeMode="contain" />
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Text style={[typography.label, styles.categoryLabel, { color: categoryColor }]}>
              {t(`events.category.${event.category}`).toUpperCase()}
            </Text>
            <Text style={[typography.headline, { color: colors.text }]} numberOfLines={1}>
              {event.title}
            </Text>
            <Text style={[typography.body, { color: colors.secondary, marginTop: 2 }]}>{dateTimeValue}</Text>
          </View>
        </View>

        <View
          style={[
            styles.countdownCard,
            { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, borderLeftColor: categoryColor, padding: spacing.md },
          ]}
        >
          <HeroCountdown targetISO={nextOccurrence.toISOString()} textColor={colors.text} labelColor={colors.secondary} />
          <View style={[styles.reminderPill, { borderColor: colors.outline, marginTop: spacing.md }]}>
            <Ionicons name="notifications-outline" size={14} color={colors.text} />
            <Text style={[typography.caption, { color: colors.text, marginLeft: 6 }]}>
              {event.reminders.length > 0 ? t('events.reminderOn') : t('events.noReminders')}
            </Text>
          </View>
        </View>

        <Section title={t('events.eventDetails')}>
          <DetailRow icon="calendar-outline" label={t('events.dateTimeLabel')} value={dateTimeValue} onPress={goEdit} />
          <DetailRow icon="globe-outline" label={t('events.timezoneLabel')} value={event.timezone} onPress={goEdit} />
          <DetailRow icon="repeat" label={t('events.repeatLabel')} value={t(`events.repeat.${event.repeat}`)} onPress={goEdit} />
        </Section>

        {event.reminders.length > 0 ? (
          <Section title={t('events.reminderSectionTitle')}>
            {event.reminders.map((offset) => {
              const fireAt = nextOccurrence.subtract(offset, 'minute');
              const fireTime = fireAt.format(prefs.timeFormat === '12h' ? 'h:mm A' : 'HH:mm');
              const fireValue = `${formatCivilDateFull(fireAt.toISOString(), prefs.calendar, useFarsiDigits)} · ${fireTime}`;
              return (
                <DetailRow key={offset} icon="notifications-outline" label={reminderLabel(offset, t)} value={fireValue} onPress={goEdit} />
              );
            })}
          </Section>
        ) : null}

        {event.note ? (
          <Section title={t('events.noteLabel')}>
            <View style={{ padding: spacing.md }}>
              <Text style={[typography.body, { color: colors.text }]}>{event.note}</Text>
            </View>
          </Section>
        ) : null}

        <View style={styles.buttonRow}>
          <Button label={t('events.share')} variant="secondary" onPress={handleShare} style={{ flex: 1, marginRight: 8 }} />
          <Button
            label={t('events.addWidget')}
            onPress={() => router.push('/widgets')}
            style={{ flex: 1, marginLeft: 8 }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  categoryImage: { width: 56, height: 56 },
  categoryLabel: { fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  countdownCard: { marginTop: 20, borderLeftWidth: 4, overflow: 'hidden' },
  reminderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  detailBadge: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  buttonRow: { flexDirection: 'row', marginTop: 8 },
});
