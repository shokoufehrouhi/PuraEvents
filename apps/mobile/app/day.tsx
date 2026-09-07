import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useFocusEffect, useRouter } from 'expo-router';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CivilCalendarPicker } from '../src/components/CivilCalendarPicker';
import { EventHeroCard } from '../src/components/EventHeroCard';
import { EmptyState } from '../src/components/ui/EmptyState';
import { listEvents } from '../src/storage/events';
import { usePreferences, useTheme } from '../src/theme/PreferencesContext';
import { accents, rowBadgeColors } from '../src/theme/tokens';
import type { PurEvent } from '../src/types/event';
import { formatCivilDateFull, shouldUseFarsiDigits } from '../src/utils/calendars';
import { fetchLocationPhotoUrl } from '../src/utils/locationPhoto';
import { doesEventOccurOnDate } from '../src/utils/recurrence';

// One row inside the "Events" timeline card below — a colored dot (the
// event's own accent color) connected by a thin vertical line to the next
// row's dot, name + "date at time", chevron to open the detail screen.
function DayEventRow({
  event,
  isLast,
  onPress,
}: {
  event: PurEvent;
  isLast: boolean;
  onPress: () => void;
}) {
  const { colors, spacing, typography } = useTheme();
  const { i18n, t } = useTranslation();
  const { prefs } = usePreferences();
  const useFarsiDigits = shouldUseFarsiDigits(i18n.language);
  const dotColor = accents[event.accentColor] ?? accents.violet;
  const time = dayjs(event.dateTimeISO).format(prefs.timeFormat === '12h' ? 'h:mm A' : 'HH:mm');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.timelineRow, { paddingHorizontal: spacing.md, opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={styles.timelineGutter}>
        <View style={[styles.timelineDot, { backgroundColor: dotColor }]} />
        {!isLast ? <View style={[styles.timelineLine, { backgroundColor: colors.outline }]} /> : null}
      </View>
      <View style={[styles.timelineContent, { paddingVertical: spacing.sm + 4 }]}>
        <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={[typography.caption, { color: colors.secondary }]}>
          {formatCivilDateFull(event.dateTimeISO, prefs.calendar, useFarsiDigits)} {t('day.at')} {time}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.outline} style={{ marginTop: spacing.sm + 4 }} />
    </Pressable>
  );
}

// Opened by tapping the Events tab's "Today" hero banner. Title/back button
// are the native Stack header (see app/_layout.tsx's "day" screen options),
// not a custom in-screen header. Same hero banner up top (always the real
// current date/time, unrelated to what's picked below); a date row lets
// the user browse any day (past or future); the device timezone is shown
// for context but isn't a per-event setting so it's read-only; and the
// list below shows every event — repeating or not — that falls on
// whichever day is currently selected, in time order.
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
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
    >
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
        // Same illustrated "holder" used for the Events tab's own empty
        // states — not the timeline card's header at all in this case,
        // matching how the Events tab shows only the EmptyState (no
        // grouped-card header stacked above it) when a tab has nothing.
        <EmptyState
          icon="calendar-outline"
          badgeIcon="time"
          badgeColor={colors.primary}
          title={t('day.emptyTitle')}
          subtitle={t('day.emptySubtitle')}
          action={{ kind: 'button', label: t('events.createEvent'), onPress: () => router.push('/event/new') }}
        />
      ) : (
        // "Events" timeline card — bell-badge header (+ a persistent
        // "+ Add" shortcut) followed by every event on the selected date
        // as a colored-dot/name/date-time row connected by a thin vertical
        // line, hairline dividers between rows, chevron to open that
        // event's detail.
        <View style={[styles.timelineCard, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
          <View style={[styles.timelineHeader, { padding: spacing.md }]}>
            <View style={[styles.timelineHeaderBadge, { backgroundColor: rowBadgeColors.pink, borderRadius: radius.md }]}>
              <Ionicons name="notifications" size={18} color="#FFFFFF" />
            </View>
            <Text style={[typography.bodyStrong, { color: colors.text, flex: 1, marginLeft: 10 }]}>{t('tabs.events')}</Text>
            <Pressable onPress={() => router.push('/event/new')} hitSlop={8}>
              <Text style={[typography.bodyStrong, { color: colors.primary }]}>+ {t('events.add')}</Text>
            </Pressable>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.outline }]} />
          {dayEvents.map((event, i) => (
            <Fragment key={event.id}>
              <DayEventRow event={event} isLast={i === dayEvents.length - 1} onPress={() => router.push(`/event/${event.id}`)} />
              {i < dayEvents.length - 1 ? <View style={[styles.divider, { backgroundColor: colors.outline }]} /> : null}
            </Fragment>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  timelineCard: { overflow: 'hidden' },
  timelineHeader: { flexDirection: 'row', alignItems: 'center' },
  timelineHeaderBadge: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  timelineRow: { flexDirection: 'row' },
  timelineGutter: { width: 20, alignItems: 'center', marginRight: 12 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 18 },
  timelineLine: { flex: 1, width: 2, marginTop: 4 },
  timelineContent: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth },
});
