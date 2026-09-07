import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
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
import { accents } from '../../../src/theme/tokens';
import type { PurEvent } from '../../../src/types/event';
import { formatCivilDateFull, shouldUseFarsiDigits } from '../../../src/utils/calendars';
import { getNextOccurrence } from '../../../src/utils/recurrence';
import { reminderLabel } from '../../../src/utils/reminders';

// A single "EVENT DETAILS"/"REMINDER"/"NOTE"/"APPEARANCE" row: icon badge +
// two-line text. Purely informational, not tappable — editing any of this
// happens through the header's own Edit button, so a per-row chevron/tap
// would just be a second, redundant way to reach the same screen.
function DetailRow({
  icon,
  label,
  value,
  badge,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  // Custom leading element (e.g. the Appearance row's gradient swatch)
  // instead of the usual neutral icon badge.
  badge?: ReactNode;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <View style={[styles.detailRow, { padding: spacing.md }]}>
      {badge ?? (
        <View style={[styles.detailBadge, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}>
          {icon ? <Ionicons name={icon} size={20} color={colors.text} /> : null}
        </View>
      )}
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[typography.bodyStrong, { color: colors.text }]}>{label}</Text>
        {value ? <Text style={[typography.caption, { color: colors.secondary, marginTop: 2 }]}>{value}</Text> : null}
      </View>
    </View>
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
            <Feather name="edit-2" size={18} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={handleDelete}
            hitSlop={12}
            style={[styles.headerButton, { backgroundColor: colors.surfaceAlt, marginLeft: 12 }]}
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
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
          <HeroCountdown
            targetISO={nextOccurrence.toISOString()}
            textColor={colors.text}
            labelColor={colors.secondary}
            dividerColor={colors.outline}
          />
          <View style={[styles.reminderPill, { borderColor: colors.outline, marginTop: spacing.md }]}>
            <Ionicons name="notifications-outline" size={14} color={colors.text} />
            <Text style={[typography.caption, { color: colors.text, marginLeft: 6 }]}>
              {event.reminders.length > 0 ? t('events.reminderOn') : t('events.noReminders')}
            </Text>
          </View>
        </View>

        <Section title={t('events.eventDetails')}>
          <DetailRow icon="calendar-outline" label={t('events.dateTimeLabel')} value={dateTimeValue} />
          <DetailRow icon="globe-outline" label={t('events.timezoneLabel')} value={event.timezone} />
          <DetailRow icon="repeat" label={t('events.repeatLabel')} value={t(`events.repeat.${event.repeat}`)} />
        </Section>

        {event.reminders.length > 0 ? (
          <Section title={t('events.reminderSectionTitle')}>
            {event.reminders.map((offset) => {
              const fireAt = nextOccurrence.subtract(offset, 'minute');
              const fireTime = fireAt.format(prefs.timeFormat === '12h' ? 'h:mm A' : 'HH:mm');
              const fireValue = `${formatCivilDateFull(fireAt.toISOString(), prefs.calendar, useFarsiDigits)} · ${fireTime}`;
              return <DetailRow key={offset} icon="notifications-outline" label={reminderLabel(offset, t)} value={fireValue} />;
            })}
          </Section>
        ) : null}

        {event.note ? (
          <Section title={t('events.noteSectionTitle')}>
            <DetailRow icon="document-text-outline" label={event.note} value="" />
          </Section>
        ) : null}

        <Section title={t('events.appearanceLabel')}>
          <DetailRow
            label={t('events.colorLabel')}
            value={`${event.accentColor.charAt(0).toUpperCase()}${event.accentColor.slice(1)} · ${t(`events.category.${event.category}`)}`}
            badge={
              <LinearGradient
                colors={[accents[event.accentColor], accents.violet]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.detailBadge, { borderRadius: radius.md }]}
              />
            }
          />
        </Section>

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
  countdownCard: { marginTop: 20, borderLeftWidth: 4, overflow: 'hidden', alignItems: 'center' },
  reminderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  detailBadge: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  buttonRow: { flexDirection: 'row', marginTop: 8 },
});
