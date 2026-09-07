import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventHeroCard } from '../../src/components/EventHeroCard';
import { EventIcon } from '../../src/components/EventIcon';
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

interface EmptyStateAction {
  kind: 'button' | 'link';
  label: string;
  onPress: () => void;
}

// Placeholder card for an empty Upcoming/Past list, per the "Compact
// holder" mockup: a soft primary-tinted card with a two-layer icon
// illustration (a big soft-circle badge + a small solid corner badge),
// bold title, secondary subtitle, and a next-step action (a "Create
// event" button for Upcoming, a "View upcoming events" link for Past).
// Built from theme tokens/Ionicons rather than cropped mockup art so it
// stays theme-aware (light/dark) and mirrors correctly under RTL — the
// mockup's own callouts ("RTL ready", "Light + Dark ready") point the
// same direction a static raster illustration couldn't follow.
function EmptyState({
  icon,
  badgeIcon,
  badgeColor,
  title,
  subtitle,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  badgeIcon: keyof typeof Ionicons.glyphMap;
  badgeColor: string;
  title: string;
  subtitle: string;
  action: EmptyStateAction;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <View
      style={[
        styles.emptyBox,
        {
          backgroundColor: `${colors.primary}0D`,
          borderColor: `${colors.primary}33`,
          borderRadius: radius.lg,
          padding: spacing.xl,
        },
      ]}
    >
      <View style={styles.emptyIllustration}>
        <View style={[styles.emptyIconCircle, { backgroundColor: `${colors.primary}1F` }]}>
          <Ionicons name={icon} size={38} color={colors.primary} />
        </View>
        <View style={[styles.emptyBadge, { backgroundColor: badgeColor, borderColor: colors.background }]}>
          <Ionicons name={badgeIcon} size={15} color="#FFFFFF" />
        </View>
      </View>
      <Text style={[typography.bodyStrong, styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[typography.caption, styles.emptySubtitle, { color: colors.secondary }]}>{subtitle}</Text>
      {action.kind === 'button' ? (
        <Pressable
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.emptyButton,
            { backgroundColor: colors.primary, borderRadius: radius.pill, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Ionicons name="add" size={16} color="#FFFFFF" />
          <Text style={styles.emptyButtonText}>{action.label}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={action.onPress} hitSlop={8} style={{ marginTop: spacing.sm }}>
          <Text style={[typography.bodyStrong, { color: colors.primary }]}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
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
          <Text style={[typography.caption, styles.rowDate, { color: categoryColor }]}>DAYS</Text>
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

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        ListHeaderComponent={
          // Always a generic "Today" banner — never tied to a specific
          // event's title/countdown (a user explicitly asked why "their"
          // event had to sit on the banner instead of just showing as a
          // normal record like everything else below it). Not pressable
          // since it isn't linked to any one event anymore.
          tab === 'upcoming' ? (
            <View style={{ marginBottom: spacing.sm }}>
              <EventHeroCard photoUri={heroPhotoUri ?? undefined} />
            </View>
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
  row: { flexDirection: 'row', alignItems: 'center' },
  rowMiddle: { flex: 1, marginLeft: 12, gap: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowIcons: { flexDirection: 'row', alignItems: 'center' },
  rowDays: { alignItems: 'flex-end' },
  rowTitle: { fontSize: 19 },
  rowDate: { fontSize: 15 },
  rowDaysNumber: { fontSize: 24 },
  emptyBox: { alignItems: 'center', borderWidth: 1, marginTop: 32 },
  emptyIllustration: { marginBottom: 16 },
  emptyIconCircle: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  emptyBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  emptySubtitle: { textAlign: 'center', marginBottom: 16, paddingHorizontal: 8 },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  emptyButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
