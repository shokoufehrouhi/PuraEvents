import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivilCalendarPicker } from '../src/components/CivilCalendarPicker';
import { EventHeroCard } from '../src/components/EventHeroCard';
import { EventIcon } from '../src/components/EventIcon';
import { listEvents } from '../src/storage/events';
import { usePreferences, useTheme } from '../src/theme/PreferencesContext';
import type { PurEvent } from '../src/types/event';
import { formatCivilDateFull, shouldUseFarsiDigits } from '../src/utils/calendars';
import { fetchLocationPhotoUrl } from '../src/utils/locationPhoto';
import { doesEventOccurOnDate } from '../src/utils/recurrence';

// Opened by tapping the Events tab's "Today" hero banner. Same hero banner
// up top (always the real current date/time, unrelated to what's picked
// below); a date row lets the user browse any day (past or future); the
// device timezone is shown for context but isn't a per-event setting so
// it's read-only; and the list below shows every event — repeating or
// not — that falls on whichever day is currently selected, in time order.
export default function DayScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();
  const { prefs } = usePreferences();
  const [events, setEvents] = useState<PurEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [heroPhotoUri, setHeroPhotoUri] = useState<string | null>(null);
  const useFarsiDigits = shouldUseFarsiDigits(i18n.language);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listEvents().then((loaded) => {
        if (!cancelled) setEvents(loaded);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // Same random location photo as the Events tab's banner — a fresh one
  // per screen mount, not shared/cached with the tab (see locationPhoto.ts).
  useEffect(() => {
    let cancelled = false;
    fetchLocationPhotoUrl().then((url) => {
      if (!cancelled) setHeroPhotoUri(url);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dayEvents = useMemo(
    () =>
      events
        .filter((e) => doesEventOccurOnDate(e.dateTimeISO, e.repeat, selectedDate))
        .sort((a, b) => dayjs(a.dateTimeISO).format('HH:mm').localeCompare(dayjs(b.dateTimeISO).format('HH:mm'))),
    [events, selectedDate]
  );

  const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const utcOffset = dayjs().format('Z');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
        <EventHeroCard photoUri={heroPhotoUri ?? undefined} />

        <Pressable
          onPress={() => setDatePickerOpen((v) => !v)}
          style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }]}
        >
          <Ionicons name="calendar-outline" size={20} color={colors.secondary} />
          <Text style={[typography.body, { color: colors.text, marginLeft: 10, flex: 1 }]}>
            {formatCivilDateFull(selectedDate.toISOString(), prefs.calendar, useFarsiDigits)}
          </Text>
          <Ionicons name={datePickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.secondary} />
        </Pressable>

        {datePickerOpen ? (
          <CivilCalendarPicker
            calendar={prefs.calendar}
            value={selectedDate}
            onChange={(date) => {
              setSelectedDate(date);
              setDatePickerOpen(false);
            }}
            useFarsiDigits={useFarsiDigits}
          />
        ) : null}

        {/* Device timezone, informational only — not a per-event field, so
            no chevron/onPress here (unlike the date row above it). */}
        <View style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }]}>
          <Ionicons name="globe-outline" size={20} color={colors.secondary} />
          <Text style={[typography.body, { color: colors.text, marginLeft: 10 }]}>
            {deviceTimeZone} (UTC{utcOffset})
          </Text>
        </View>

        {dayEvents.length === 0 ? (
          <Text style={[typography.body, styles.empty, { color: colors.secondary }]}>{t('day.empty')}</Text>
        ) : (
          dayEvents.map((event) => (
            <Pressable
              key={event.id}
              onPress={() => router.push(`/event/${event.id}`)}
              style={({ pressed }) => [
                styles.eventRow,
                { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.sm + 4, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <EventIcon category={event.category} size={44} />
              <View style={styles.eventRowMiddle}>
                <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                  {event.title}
                </Text>
                <Text style={[typography.caption, { color: colors.secondary }]}>{dayjs(event.dateTimeISO).format('HH:mm')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  eventRow: { flexDirection: 'row', alignItems: 'center' },
  eventRowMiddle: { flex: 1, marginLeft: 12, gap: 2 },
  empty: { textAlign: 'center', marginTop: 24 },
});
