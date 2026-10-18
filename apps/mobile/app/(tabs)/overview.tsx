import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventIcon } from '../../src/components/EventIcon';
import { HeroCountdown } from '../../src/components/HeroCountdown';
import { Button } from '../../src/components/ui/Button';
import { listEvents, onEventsChanged } from '../../src/storage/events';
import { listNotificationLog, type NotificationLogEntry } from '../../src/storage/notificationLog';
import { usePro } from '../../src/subscription';
import { getCategoryIcon } from '../../src/theme/icons';
import { usePreferences, useTheme } from '../../src/theme/PreferencesContext';
import { responsiveContent } from '../../src/theme/tokens';
import type { PurEvent } from '../../src/types/event';
import { civilMonthName, formatCivilDateFull, localizeDigits } from '../../src/utils/calendars';
import { computeOverview, type TimelineGroup } from '../../src/utils/overview';
import { flipInRTL } from '../../src/utils/rtl';

// The Overview tab (docs/PROJECT.md "personal dashboard"): what's coming up,
// how events split across categories, and how many came and went over the
// past months. Pro only — a free user sees what it offers and a way to
// upgrade instead.
export default function OverviewScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();
  const { prefs } = usePreferences();
  const { isPro } = usePro();
  const [events, setEvents] = useState<PurEvent[]>([]);
  const [log, setLog] = useState<NotificationLogEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      listEvents().then(setEvents);
      listNotificationLog().then(setLog);
      return onEventsChanged(() => {
        listEvents().then(setEvents);
      });
    }, []),
  );

  const data = useMemo(() => computeOverview(events, log, isPro, prefs.calendar), [events, log, isPro, prefs.calendar]);
  const n = (value: number) => localizeDigits(value, i18n.language);

  const card = (children: ReactNode, title?: string) => (
    <View style={{ marginBottom: spacing.md }}>
      {title ? <Text style={[typography.label, styles.cardTitle, { color: colors.secondary }]}>{title.toUpperCase()}</Text> : null}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }}>{children}</View>
    </View>
  );

  const stat = (value: number, label: string) => (
    <View style={styles.stat}>
      <Text style={[typography.headline, { color: colors.text }]}>{n(value)}</Text>
      <Text style={[typography.caption, { color: colors.secondary, textAlign: 'center' }]}>{label}</Text>
    </View>
  );

  // Title with the same plan badge as the Events tab: "Pro" for a Pro user,
  // a tappable "Get Pro" for a free one.
  const header = (
    <View style={[styles.titleRow, { marginBottom: spacing.md }]}>
      <Text style={[typography.title, { color: colors.text }]}>{t('overview.title')}</Text>
      <Pressable
        disabled={isPro}
        onPress={() => router.push('/upgrade')}
        style={[styles.planBadge, { backgroundColor: `${colors.primary}1A` }]}
      >
        <Ionicons name="diamond" size={12} color={colors.primary} />
        <Text style={[typography.caption, { color: colors.primary, marginLeft: 4, fontWeight: '700' }]}>
          {isPro ? t('compare.pro') : t('widgets.getPro')}
        </Text>
      </Pressable>
    </View>
  );

  if (!isPro) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 140, ...responsiveContent }}>
          {header}
          {card(
            <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
              <View style={[styles.lockBadge, { backgroundColor: `${colors.primary}1A` }]}>
                <Ionicons name="stats-chart" size={28} color={colors.primary} />
              </View>
              <Text style={[typography.headline, { color: colors.text, marginTop: spacing.md, textAlign: 'center' }]}>
                {t('overview.lockedTitle')}
              </Text>
              <Text style={[typography.body, { color: colors.secondary, marginTop: spacing.sm, textAlign: 'center' }]}>
                {t('overview.lockedBody')}
              </Text>
              <Button label={t('widgets.getPro')} icon="diamond" onPress={() => router.push('/upgrade')} style={{ marginTop: spacing.lg, alignSelf: 'stretch' }} />
            </View>,
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const next = data.upcoming[0];
  const maxCategory = Math.max(1, ...data.byCategory.map((c) => c.count));
  const maxMonth = Math.max(1, ...data.perMonth.map((m) => m.count));
  const groupLabel: Record<TimelineGroup, string> = {
    today: t('overview.today'),
    thisWeek: t('overview.thisWeek'),
    nextWeek: t('overview.nextWeek'),
    later: t('overview.later'),
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 140, ...responsiveContent }}>
        {header}

        {card(
          <>
            <View style={styles.statRow}>
              {stat(data.upcoming.length, t('overview.upcoming'))}
              {stat(data.next7Days, t('overview.next7Days'))}
              {stat(data.next30Days, t('overview.next30Days'))}
            </View>
            {next ? (
              <Pressable
                onPress={() => router.push(`/event/${next.event.id}`)}
                style={[styles.nextRow, { borderTopColor: colors.outline, marginTop: spacing.md, paddingTop: spacing.md }]}
              >
                <EventIcon category={next.event.category} size={40} />
                <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
                  <Text style={[typography.caption, { color: colors.secondary }]}>{t('overview.nextEvent')}</Text>
                  <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                    {next.event.title}
                  </Text>
                </View>
                <HeroCountdown
                  targetISO={next.at.toISOString()}
                  textColor={getCategoryIcon(next.event.category).color}
                  labelColor={getCategoryIcon(next.event.category).color}
                  numberSize={16}
                  labelSize={8}
                  compact
                />
              </Pressable>
            ) : (
              <Text style={[typography.body, { color: colors.secondary, marginTop: spacing.md, textAlign: 'center' }]}>
                {t('overview.noUpcoming')}
              </Text>
            )}
          </>,
        )}

        {card(
          data.timeline.length ? (
            data.timeline.map(({ group, items }, gi) => (
              <View key={group} style={{ marginTop: gi ? spacing.md : 0 }}>
                <Text style={[typography.label, { color: colors.primary, marginBottom: 6 }]}>{groupLabel[group]}</Text>
                {items.map(({ event, at }) => (
                  <Pressable key={event.id} onPress={() => router.push(`/event/${event.id}`)} style={styles.timelineRow}>
                    <EventIcon category={event.category} size={28} />
                    <Text style={[typography.body, { color: colors.text, flex: 1, marginHorizontal: spacing.sm }]} numberOfLines={1}>
                      {event.title}
                    </Text>
                    <Text style={[typography.caption, { color: colors.secondary }]}>
                      {formatCivilDateFull(at.toISOString(), prefs.calendar, i18n.language)}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.outline} style={[{ marginLeft: 4 }, flipInRTL]} />
                  </Pressable>
                ))}
              </View>
            ))
          ) : (
            <Text style={[typography.body, { color: colors.secondary, textAlign: 'center' }]}>{t('overview.nothingNext30')}</Text>
          ),
          t('overview.timeline'),
        )}

        {data.byCategory.length
          ? card(
              data.byCategory.map(({ category, count }) => (
                <View key={category} style={styles.barRow}>
                  <EventIcon category={category} size={24} />
                  <Text style={[typography.caption, { color: colors.text, width: 76, marginHorizontal: spacing.sm }]} numberOfLines={1}>
                    {t(`events.category.${category}`)}
                  </Text>
                  <View style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
                    <View style={[styles.bar, { width: `${(count / maxCategory) * 100}%`, backgroundColor: getCategoryIcon(category).color }]} />
                  </View>
                  <Text style={[typography.caption, { color: colors.secondary, width: 28, textAlign: 'right' }]}>{n(count)}</Text>
                </View>
              )),
              t('overview.byCategory'),
            )
          : null}

        {card(
          <>
            <View style={styles.statRow}>
              {stat(data.pastCounts.months3, t('overview.last3Months'))}
              {stat(data.pastCounts.months6, t('overview.last6Months'))}
              {stat(data.pastCounts.months12, t('overview.last12Months'))}
            </View>
            <Text style={[typography.label, { color: colors.secondary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
              {t('overview.perMonth')}
            </Text>
            <View style={styles.columns}>
              {data.perMonth.map(({ month, count }) => (
                <View key={month.valueOf()} style={styles.column}>
                  <Text style={[typography.caption, { color: colors.secondary }]}>{n(count)}</Text>
                  <View style={[styles.columnTrack, { backgroundColor: colors.surfaceAlt }]}>
                    <View style={[styles.columnFill, { height: `${(count / maxMonth) * 100}%`, backgroundColor: colors.primary }]} />
                  </View>
                  <Text style={[typography.caption, { color: colors.secondary, fontSize: 11 }]} numberOfLines={1}>
                    {/* The month in the app's calendar (Shamsi/Hijri months are
                        their own spans, see computeOverview). Gregorian names
                        are shortened where the alphabet allows (Sep, Okt, Eyl);
                        Farsi/Arabic ones and Shamsi/Hijri names stay whole. */}
                    {prefs.calendar === 'gregorian' && !['fa', 'ar'].includes(i18n.language)
                      ? civilMonthName(month.toISOString(), prefs.calendar, i18n.language).slice(0, 3)
                      : civilMonthName(month.toISOString(), prefs.calendar, i18n.language)}
                  </Text>
                </View>
              ))}
            </View>
          </>,
          t('overview.history'),
        )}

        {card(
          <View style={styles.statRow}>
            {stat(data.remindersNext7Days, t('overview.remindersNext7Days'))}
            {stat(data.notificationsLast30Days, t('overview.notificationsLast30Days'))}
          </View>,
          t('overview.reminders'),
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  cardTitle: { marginBottom: 6, marginHorizontal: 4, letterSpacing: 0.5 },
  statRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  nextRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  timelineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  barRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 5 },
  columns: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  column: { flex: 1, alignItems: 'center', marginHorizontal: 3 },
  columnTrack: { width: 18, height: 80, borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end', marginVertical: 4 },
  columnFill: { width: '100%', borderRadius: 6 },
  lockBadge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});
