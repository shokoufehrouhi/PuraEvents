import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventHeroCard } from '../../src/components/EventHeroCard';
import { EventIcon } from '../../src/components/EventIcon';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SegmentedControl } from '../../src/components/ui/SegmentedControl';
import { listEvents } from '../../src/storage/events';
import { getCategoryIcon } from '../../src/theme/icons';
import { usePreferences, useTheme } from '../../src/theme/PreferencesContext';
import { REPEAT_STYLES } from '../../src/theme/repeatStyles';
import { accents } from '../../src/theme/tokens';
import type { PurEvent } from '../../src/types/event';
import { formatCivilDateFull, shouldUseFarsiDigits } from '../../src/utils/calendars';
import { fetchLocationPhotoUrl } from '../../src/utils/locationPhoto';
import { getNextOccurrence } from '../../src/utils/recurrence';

function daysUntil(iso: string): number {
  return Math.ceil(dayjs(iso).diff(dayjs(), 'hour') / 24);
}

function EventRow({ event, onPress }: { event: PurEvent; onPress: () => void }) {
  const { colors, spacing, radius, typography } = useTheme();
  const { i18n } = useTranslation();
  const { prefs } = usePreferences();
  const nextOccurrence = getNextOccurrence(event.dateTimeISO, event.repeat);
  const days = daysUntil(nextOccurrence.toISOString());
  // Matches the mockup: the remaining-days count/label is tinted with the
  // event's own category color instead of neutral text, same color used
  // for that category's icon badge elsewhere.
  const { color: categoryColor } = getCategoryIcon(event.category);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.sm + 4, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <EventIcon category={event.category} size={58} />
      <View style={styles.rowMiddle}>
        <Text style={[typography.bodyStrong, styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={[typography.caption, styles.rowDate, { color: colors.secondary }]}>
          {formatCivilDateFull(nextOccurrence.toISOString(), prefs.calendar, shouldUseFarsiDigits(i18n.language))}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <View style={styles.rowIcons}>
          {event.reminders.length > 0 ? <Ionicons name="notifications" size={24} color={colors.secondary} /> : null}
          {event.repeat !== 'none' ? (
            <Ionicons
              name={REPEAT_STYLES[event.repeat].icon}
              size={24}
              color={REPEAT_STYLES[event.repeat].color}
              style={{ marginLeft: 8 }}
            />
          ) : null}
        </View>
        <View style={styles.rowDays}>
          <Text style={[typography.headline, styles.rowDaysNumber, { color: categoryColor }]}>{Math.max(days, 0)}</Text>
          <Text style={[typography.caption, styles.rowDate, { color: categoryColor }]}>Days</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function EventListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const [events, setEvents] = useState<PurEvent[]>([]);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [heroPhotoUri, setHeroPhotoUri] = useState<string | null>(null);
  // Ticks the Upcoming/Past split live (see the useMemo below) so an event
  // moves to Past on its own once its time passes, without the user having
  // to leave and come back to this screen — same cadence as HeroCountdown's
  // own tick.
  const [now, setNow] = useState(() => dayjs());

  useEffect(() => {
    const interval = setInterval(() => setNow(dayjs()), 30_000);
    return () => clearInterval(interval);
  }, []);

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

  // Random photo of the device's current city/country — only for the top
  // hero banner, fetched once per app launch (mount, not per-focus — a new
  // one is wanted per run, not per tab visit). Failure (offline, no API
  // key, no results) just leaves it null and the hero card falls back to
  // its normal flat theme color.
  useEffect(() => {
    let cancelled = false;
    fetchLocationPhotoUrl().then((url) => {
      if (!cancelled) setHeroPhotoUri(url);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { upcoming, pastList } = useMemo(() => {
    // A repeating event's *next* occurrence is always upcoming by
    // definition — only a one-time (repeat: 'none') event can be "past".
    const isPast = (e: PurEvent) => e.repeat === 'none' && !dayjs(e.dateTimeISO).isAfter(now);
    return {
      upcoming: events.filter((e) => !isPast(e)),
      pastList: events.filter(isPast).reverse(),
    };
  }, [events, now]);

  const listData = tab === 'upcoming' ? upcoming : pastList;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: spacing.md }]}>
        <Text style={[typography.title, styles.headerTitle, { color: colors.text }]}>{t('appName')}</Text>
        <Pressable
          onPress={() => router.push('/event/new')}
          hitSlop={12}
          style={({ pressed }) => [
            styles.headerAddButton,
            { backgroundColor: colors.surface, borderColor: colors.outline, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="add" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.lg }}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'upcoming', label: t('events.upcoming') },
            { value: 'past', label: t('events.past') },
          ]}
        />
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        ListHeaderComponent={
          // Always a generic "Today" banner — never tied to a specific
          // event's title/countdown (a user explicitly asked why "their"
          // event had to sit on the banner instead of just showing as a
          // normal record like everything else below it). Tapping it opens
          // the Day view (app/day.tsx) — a browsable day-by-day agenda,
          // defaulting to today, listing whatever events fall on the
          // selected date.
          tab === 'upcoming' ? (
            <Pressable onPress={() => router.push('/day')} style={{ marginBottom: spacing.sm }}>
              <EventHeroCard photoUri={heroPhotoUri ?? undefined} />
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          // Upcoming/Past both just check their own list now that the
          // banner no longer "hides" the nearest event — Past keeps its
          // own message (no "add your first countdown" CTA — that action
          // belongs to the Upcoming/global empty state).
          tab === 'upcoming' ? (
            upcoming.length === 0 ? (
              <EmptyState
                icon="calendar-outline"
                badgeIcon="time"
                badgeColor={colors.primary}
                title={t('events.emptyTitle')}
                subtitle={t('events.emptySubtitle')}
                action={{ kind: 'button', label: t('events.createEvent'), onPress: () => router.push('/event/new') }}
              />
            ) : null
          ) : pastList.length === 0 ? (
            <EmptyState
              icon="mail-open-outline"
              badgeIcon="checkmark"
              badgeColor={accents.mint}
              title={t('events.emptyPastTitle')}
              subtitle={t('events.emptyPastSubtitle')}
              action={{ kind: 'link', label: t('events.viewUpcoming'), onPress: () => setTab('upcoming') }}
            />
          ) : null
        }
        renderItem={({ item }) => <EventRow event={item} onPress={() => router.push(`/event/${item.id}`)} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 },
  headerTitle: { fontSize: 28, fontWeight: '700' },
  headerAddButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowMiddle: { flex: 1, marginLeft: 12, gap: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowIcons: { flexDirection: 'row', alignItems: 'center' },
  rowDays: { alignItems: 'center' },
  rowTitle: { fontSize: 19 },
  rowDate: { fontSize: 15 },
  rowDaysNumber: { fontSize: 24 },
});
