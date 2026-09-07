import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useFocusEffect, useRouter } from 'expo-router';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventHeroCard } from '../../src/components/EventHeroCard';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SegmentedControl } from '../../src/components/ui/SegmentedControl';
import { listEvents } from '../../src/storage/events';
import { usePreferences, useTheme } from '../../src/theme/PreferencesContext';
import { accents } from '../../src/theme/tokens';
import type { PurEvent } from '../../src/types/event';
import { formatCivilDateFull, shouldUseFarsiDigits } from '../../src/utils/calendars';
import { fetchLocationPhotoUrl } from '../../src/utils/locationPhoto';
import { getNextOccurrence } from '../../src/utils/recurrence';

// One row inside the grouped "Events" card below — name + date/time,
// chevron to open the detail screen. Matches the Reminders section's row
// format (see event detail/wizard) rather than the earlier per-event card
// with its own icon/countdown-number, per explicit request.
function EventRow({ event, onPress }: { event: PurEvent; onPress: () => void }) {
  const { colors, spacing, typography } = useTheme();
  const { i18n } = useTranslation();
  const { prefs } = usePreferences();
  const nextOccurrence = getNextOccurrence(event.dateTimeISO, event.repeat);
  const time = nextOccurrence.format(prefs.timeFormat === '12h' ? 'h:mm A' : 'HH:mm');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.groupedRow, { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4, opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={[typography.caption, { color: colors.secondary }]}>
          {formatCivilDateFull(nextOccurrence.toISOString(), prefs.calendar, shouldUseFarsiDigits(i18n.language))} · {time}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.outline} />
    </Pressable>
  );
}

export default function EventListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();
  const [events, setEvents] = useState<PurEvent[]>([]);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [heroPhotoUri, setHeroPhotoUri] = useState<string | null>(null);

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
    const now = dayjs();
    // A repeating event's *next* occurrence is always upcoming by
    // definition — only a one-time (repeat: 'none') event can be "past".
    const isPast = (e: PurEvent) => e.repeat === 'none' && !dayjs(e.dateTimeISO).isAfter(now);
    return {
      upcoming: events.filter((e) => !isPast(e)),
      pastList: events.filter(isPast).reverse(),
    };
  }, [events]);

  const listData = tab === 'upcoming' ? upcoming : pastList;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: spacing.md }]}>
        <Text style={[typography.title, { color: colors.text }]}>{t('appName')}</Text>
        <Pressable onPress={() => router.push('/event/new')} hitSlop={12}>
          <Ionicons name="add-circle" size={30} color={colors.primary} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.sm }}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'upcoming', label: t('events.upcoming') },
            { value: 'past', label: t('events.past') },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
        {tab === 'upcoming' ? (
          // Always a generic "Today" banner — never tied to a specific
          // event's title/countdown (a user explicitly asked why "their"
          // event had to sit on the banner instead of just showing as a
          // normal record like everything else below it). Tapping it opens
          // the Day view (app/day.tsx) — a browsable day-by-day agenda,
          // defaulting to today, listing whatever events fall on the
          // selected date.
          <Pressable onPress={() => router.push('/day')}>
            <EventHeroCard photoUri={heroPhotoUri ?? undefined} />
          </Pressable>
        ) : null}

        {listData.length > 0 ? (
          // Grouped card matching the Reminders section's look (see event
          // detail/wizard): a title row (bell + "Events" + a persistent
          // "+ Add" shortcut alongside the header's own add button) with
          // every event as a name/date-time row underneath, hairline
          // dividers between them, chevron to open that event's detail.
          <View style={[styles.groupedCard, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
            <View style={[styles.groupedHeader, { padding: spacing.md }]}>
              <Ionicons name="notifications" size={20} color={colors.text} />
              <Text style={[typography.bodyStrong, { color: colors.text, flex: 1, marginLeft: 10 }]}>
                {t('tabs.events')}
              </Text>
              <Pressable onPress={() => router.push('/event/new')} hitSlop={8}>
                <Text style={[typography.bodyStrong, { color: colors.primary }]}>+ {t('events.add')}</Text>
              </Pressable>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.outline }]} />
            {listData.map((item, i) => (
              <Fragment key={item.id}>
                <EventRow event={item} onPress={() => router.push(`/event/${item.id}`)} />
                {i < listData.length - 1 ? <View style={[styles.divider, { backgroundColor: colors.outline }]} /> : null}
              </Fragment>
            ))}
          </View>
        ) : tab === 'upcoming' ? (
          <EmptyState
            icon="calendar-outline"
            badgeIcon="time"
            badgeColor={colors.primary}
            title={t('events.emptyTitle')}
            subtitle={t('events.emptySubtitle')}
            action={{ kind: 'button', label: t('events.createEvent'), onPress: () => router.push('/event/new') }}
          />
        ) : (
          <EmptyState
            icon="mail-open-outline"
            badgeIcon="checkmark"
            badgeColor={accents.mint}
            title={t('events.emptyPastTitle')}
            subtitle={t('events.emptyPastSubtitle')}
            action={{ kind: 'link', label: t('events.viewUpcoming'), onPress: () => setTab('upcoming') }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 },
  groupedCard: { overflow: 'hidden' },
  groupedHeader: { flexDirection: 'row', alignItems: 'center' },
  groupedRow: { flexDirection: 'row', alignItems: 'center' },
  divider: { height: StyleSheet.hairlineWidth },
});
