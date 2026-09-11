import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventHeroCard } from '../../src/components/EventHeroCard';
import { EventIcon } from '../../src/components/EventIcon';
import { HeroCountdown } from '../../src/components/HeroCountdown';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SegmentedControl } from '../../src/components/ui/SegmentedControl';
import { listEvents } from '../../src/storage/events';
import { FREE_LIMITS, usePro } from '../../src/subscription';
import { getCategoryIcon } from '../../src/theme/icons';
import { usePreferences, useTheme } from '../../src/theme/PreferencesContext';
import { REPEAT_STYLES } from '../../src/theme/repeatStyles';
import { accents } from '../../src/theme/tokens';
import type { PurEvent } from '../../src/types/event';
import { formatCivilDateFull, shouldUseFarsiDigits } from '../../src/utils/calendars';
import { fetchLocationPhotoUrl } from '../../src/utils/locationPhoto';
import { getNextOccurrence, getPreviousOccurrence } from '../../src/utils/recurrence';

type PastFilter = '3m' | '6m' | '1y' | 'all';

// Months back each filter cuts off at — 'all' has no cutoff (handled
// separately below rather than an artificial huge number).
const PAST_FILTER_MONTHS: Partial<Record<PastFilter, number>> = { '3m': 3, '6m': 6, '1y': 12 };
const PAST_FILTER_LABEL_KEYS: Record<PastFilter, string> = {
  '3m': 'events.pastFilter3m',
  '6m': 'events.pastFilter6m',
  '1y': 'events.pastFilter1y',
  all: 'events.pastFilterAll',
};

function EventRow({ event, onPress }: { event: PurEvent; onPress: () => void }) {
  const { colors, spacing, radius, typography } = useTheme();
  const { i18n } = useTranslation();
  const { prefs } = usePreferences();
  const nextOccurrence = getNextOccurrence(event.dateTimeISO, event.repeat);
  // Matches the mockup: the remaining-time count/labels are tinted with the
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
          {event.reminders.length > 0 ? <Ionicons name="notifications" size={18} color={colors.secondary} /> : null}
          {event.repeat !== 'none' ? (
            <Ionicons
              name={REPEAT_STYLES[event.repeat].icon}
              size={18}
              color={REPEAT_STYLES[event.repeat].color}
              style={{ marginLeft: 6 }}
            />
          ) : null}
        </View>
        <HeroCountdown targetISO={nextOccurrence.toISOString()} textColor={categoryColor} labelColor={categoryColor} numberSize={16} labelSize={8} compact />
      </View>
    </Pressable>
  );
}

// Free-plan "you've hit the event cap" notice — matches the mockup: a
// diamond badge, title/subtitle, and a "View Pro >" link, the whole card
// tappable to /paywall (same destination the wizard's own save-time gate
// already routes to when creating past the limit — see EventWizard.tsx).
function LimitBanner({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.limitBanner,
        {
          backgroundColor: `${colors.primary}14`,
          borderColor: `${colors.primary}33`,
          borderRadius: radius.lg,
          padding: spacing.sm + 4,
          marginBottom: spacing.sm,
        },
      ]}
    >
      <View style={[styles.limitBadge, { backgroundColor: `${colors.primary}22`, borderRadius: 999 }]}>
        <Ionicons name="diamond" size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[typography.bodyStrong, { color: colors.text }]}>{t('events.limitReachedTitle')}</Text>
        <Text style={[typography.caption, { color: colors.secondary, marginTop: 2 }]}>{t('events.limitReachedSubtitle')}</Text>
      </View>
      <View style={styles.limitLink}>
        <Text style={[typography.bodyStrong, { color: colors.primary }]}>{t('events.viewPro')}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </View>
    </Pressable>
  );
}

export default function EventListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();
  const { isPro } = usePro();
  const [events, setEvents] = useState<PurEvent[]>([]);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [pastFilter, setPastFilter] = useState<PastFilter>('all');
  const [pastFilterMenuOpen, setPastFilterMenuOpen] = useState(false);
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
    const oneTimePast = events.filter(isPast);

    // A repeating event never leaves Upcoming (it just keeps counting down
    // to its next occurrence), but each cycle it completes should still
    // leave a record in Past — a snapshot of that one completed occurrence
    // (repeat: 'none' so it renders as a plain fixed-date row, not another
    // live countdown). Same event id as the live row since there's no
    // separate historical-record storage; tapping it opens the same event.
    const repeatingRecords = events.flatMap((e) => {
      if (e.repeat === 'none') return [];
      const previous = getPreviousOccurrence(e.dateTimeISO, e.repeat, now);
      return previous ? [{ ...e, dateTimeISO: previous.toISOString(), repeat: 'none' as const }] : [];
    });

    // Sorted live by *next* occurrence (not just once at fetch time, see
    // storage/events.ts's own sort) — re-derived from `now` on every tick,
    // so a repeat rolling over to its next cycle (or any other edit that
    // changes an event's remaining time) immediately reorders the list
    // instead of waiting for the next screen focus/fetch.
    const upcomingSorted = events
      .filter((e) => !isPast(e))
      .sort((a, b) => getNextOccurrence(a.dateTimeISO, a.repeat, now).valueOf() - getNextOccurrence(b.dateTimeISO, b.repeat, now).valueOf());

    return {
      upcoming: upcomingSorted,
      pastList: [...oneTimePast, ...repeatingRecords].sort((a, b) => (a.dateTimeISO < b.dateTimeISO ? 1 : -1)),
    };
  }, [events, now]);

  const filteredPastList = useMemo(() => {
    const months = PAST_FILTER_MONTHS[pastFilter];
    if (!months) return pastList;
    const cutoff = now.subtract(months, 'month');
    return pastList.filter((e) => dayjs(e.dateTimeISO).isAfter(cutoff));
  }, [pastList, pastFilter, now]);

  const listData = tab === 'upcoming' ? upcoming : filteredPastList;
  // "Active events" mirrors EventWizard's own create-time gate (total
  // stored count, not just Upcoming) — see FREE_LIMITS.maxActiveEvents.
  const limitReached = !isPro && events.length >= FREE_LIMITS.maxActiveEvents;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: spacing.md }]}>
        <View style={styles.headerTitleRow}>
          <Text style={[typography.title, styles.headerTitle, { color: colors.text }]}>{t('appName')}</Text>
          {/* Same plan badge as the Widgets tab's own header (see
              app/(tabs)/widgets.tsx) — free/Pro status wasn't visible
              anywhere on this screen before. Free reads as a tappable
              "Get Pro" CTA (routes to /upgrade), not a neutral status
              label — a bare "Free plan" caption just described the
              account, it didn't invite tapping toward Pro. */}
          {isPro ? (
            <View style={[styles.planBadge, { backgroundColor: `${colors.primary}1A`, borderRadius: 999 }]}>
              <Ionicons name="diamond" size={12} color={colors.primary} />
              <Text style={[typography.caption, { color: colors.primary, marginLeft: 4, fontWeight: '700' }]}>{t('compare.pro')}</Text>
            </View>
          ) : (
            <Pressable
              onPress={() => router.push('/upgrade')}
              style={[styles.planBadge, { backgroundColor: `${colors.primary}1A`, borderRadius: 999 }]}
            >
              <Ionicons name="diamond" size={12} color={colors.primary} />
              <Text style={[typography.caption, { color: colors.primary, marginLeft: 4, fontWeight: '700' }]}>{t('widgets.getPro')}</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => router.push(limitReached ? '/upgrade' : '/event/new')}
          hitSlop={12}
          style={({ pressed }) => [
            styles.headerAddButton,
            { backgroundColor: colors.surface, borderColor: colors.outline, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="add" size={22} color={colors.primary} />
          {limitReached ? (
            <View style={[styles.lockBadge, { backgroundColor: colors.primary, borderColor: colors.background }]}>
              <Ionicons name="lock-closed" size={9} color="#fff" />
            </View>
          ) : null}
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

      {/* Past-only date-range filter — a "Filtered by: <value>" label
          opening a bottom-sheet picker (same pattern as the Widgets tab's
          own Sort menu), not a row of chips/another SegmentedControl. */}
      {tab === 'past' ? (
        <View style={[styles.pastFilterRow, { paddingHorizontal: spacing.md, marginTop: spacing.lg, marginBottom: spacing.xs }]}>
          <Text style={[typography.body, { color: colors.secondary }]}>{t('events.filteredBy')}</Text>
          <Pressable
            onPress={() => setPastFilterMenuOpen(true)}
            style={[styles.pastFilterValue, { backgroundColor: colors.surfaceAlt, borderRadius: 999 }]}
          >
            <Text style={[typography.bodyStrong, { color: colors.text }]}>{t(PAST_FILTER_LABEL_KEYS[pastFilter])}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.secondary} style={{ marginLeft: 4 }} />
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        ListHeaderComponent={
          <>
            {/* Pro upsell only makes sense against the active-event cap,
                which Upcoming represents — Past is a history view, not
                somewhere hitting the limit is relevant. */}
            {limitReached && tab === 'upcoming' ? (
              <LimitBanner onPress={() => router.push('/upgrade')} />
            ) : null}
            {/* Always a generic "Today" banner — never tied to a specific
                event's title/countdown (a user explicitly asked why "their"
                event had to sit on the banner instead of just showing as a
                normal record like everything else below it). Tapping it opens
                the Day view (app/day.tsx) — a browsable day-by-day agenda,
                defaulting to today, listing whatever events fall on the
                selected date. */}
            {tab === 'upcoming' ? (
              <Pressable onPress={() => router.push('/day')} style={{ marginBottom: spacing.sm }}>
                <EventHeroCard photoUri={heroPhotoUri ?? undefined} />
              </Pressable>
            ) : null}
          </>
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
          ) : filteredPastList.length === 0 ? (
            // Past has events, they're just all outside the selected
            // range — a different empty state than "no past events ever",
            // with an action that clears the filter instead of jumping
            // to Upcoming.
            <EmptyState
              icon="mail-open-outline"
              badgeIcon="checkmark"
              badgeColor={accents.mint}
              title={t('events.emptyPastFilterTitle')}
              subtitle={t('events.emptyPastFilterSubtitle')}
              action={{ kind: 'link', label: t('events.clearPastFilter'), onPress: () => setPastFilter('all') }}
            />
          ) : null
        }
        renderItem={({ item }) => <EventRow event={item} onPress={() => router.push(`/event/${item.id}`)} />}
      />

      <Modal visible={pastFilterMenuOpen} transparent animationType="fade" onRequestClose={() => setPastFilterMenuOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPastFilterMenuOpen(false)}>
          <View style={[styles.filterSheet, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
            {(['3m', '6m', '1y', 'all'] as PastFilter[]).map((key) => (
              <Pressable
                key={key}
                onPress={() => {
                  setPastFilter(key);
                  setPastFilterMenuOpen(false);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}
              >
                <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{t(PAST_FILTER_LABEL_KEYS[key])}</Text>
                {pastFilter === key ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pastFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pastFilterValue: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  filterSheet: { paddingVertical: 8, marginHorizontal: 16, marginBottom: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  headerTitle: { fontSize: 28, fontWeight: '700' },
  planBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6 },
  headerAddButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitBanner: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  limitBadge: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  limitLink: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowMiddle: { flex: 1, marginLeft: 12, gap: 2 },
  // Column, not row, so the icons sit above the days/hrs/min countdown
  // instead of beside it — see the "icons on top" request.
  rowRight: { flexDirection: 'column', alignItems: 'flex-end', gap: 6 },
  rowIcons: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 19 },
  rowDate: { fontSize: 15 },
});
