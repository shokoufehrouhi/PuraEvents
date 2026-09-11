import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import { HeroCountdown } from '../../../src/components/HeroCountdown';
import { MiniWidget } from '../../../src/components/MiniWidget';
import { Button } from '../../../src/components/ui/Button';
import { Section } from '../../../src/components/ui/Section';
import { cancelRemindersForEvent, scheduleRemindersForEvent } from '../../../src/notifications';
import { deleteEvent, getEvent, listEvents } from '../../../src/storage/events';
import { usePro } from '../../../src/subscription';
import { getCategoryIcon } from '../../../src/theme/icons';
import { usePreferences, useTheme } from '../../../src/theme/PreferencesContext';
import { accents } from '../../../src/theme/tokens';
import type { PurEvent } from '../../../src/types/event';
import { formatCivilDateFull, shouldUseFarsiDigits } from '../../../src/utils/calendars';
import { darken } from '../../../src/utils/color';
import { getActiveEventIds, isEventFrozen } from '../../../src/utils/eventAccess';
import { getNextOccurrence } from '../../../src/utils/recurrence';
import { getActiveReminders, reminderLabel } from '../../../src/utils/reminders';

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
  const { isPro } = usePro();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<PurEvent | null>(null);
  // Needed to rank this event against every other one for the free-plan
  // "only 3 editable at once" rotation below — see getActiveEventIds.
  const [allEvents, setAllEvents] = useState<PurEvent[]>([]);
  // Off-screen capture target for the Share button (see handleShare below)
  // — always rendered at 'large', independent of the visible preview's own
  // event.widgetSize, since what gets shared should read like a real
  // large-size widget regardless of what size the user actually placed.
  const shareCaptureRef = useRef<ViewShotRef>(null);

  useFocusEffect(
    useCallback(() => {
      if (id) getEvent(id).then((e) => setEvent(e ?? null));
      listEvents().then(setAllEvents);
    }, [id])
  );

  // Keeps the *actual* scheduled push notifications in sync with what's
  // shown as active below — same freeze pattern as widgets, just applied
  // live to the OS schedule too, not only the UI: reminders.tsx never gets
  // rewritten on Pro lapse, so without this a stale, no-longer-visible
  // "1 hour before" would still silently fire. Re-runs whenever isPro
  // flips (usePro polls every 15s) or a fresh event loads, so a lapsed
  // plan gets reconciled down to just the free offset without needing to
  // re-save the event, and a renewed plan restores the rest just as fast.
  useEffect(() => {
    if (!event) return;
    scheduleRemindersForEvent(event, isPro);
  }, [event, isPro]);

  if (!event) return null;

  async function handleDelete() {
    Alert.alert(t('events.deleteConfirmTitle'), t('events.deleteConfirmMessage', { title: event!.title }), [
      { text: t('events.cancel'), style: 'cancel' },
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

  // Captures the hidden 'large' MiniWidget below (see shareCaptureRef) as a
  // PNG and hands it to the native Share Sheet — same "no fixed destination,
  // works with whatever's installed" approach as §3.5 in docs/PROJECT.md,
  // just image-only for now rather than the full text+card+auto-send
  // version described there.
  async function handleShare() {
    try {
      const uri = await shareCaptureRef.current?.capture?.();
      if (!uri) return;
      if (!(await Sharing.isAvailableAsync())) return;
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: event!.title });
    } catch {
      // Capture/share failing (e.g. user dismissed the sheet) isn't worth
      // surfacing — same "just don't show the broken thing" posture as a
      // failed photo load elsewhere (see MiniWidget's own onError).
    }
  }

  // Over the free-plan "3 editable at once" limit — see getActiveEventIds.
  // Tappable, not just disabled: same as a frozen widget, tapping Edit here
  // routes to the paywall instead of the editor.
  const activeEventIds = getActiveEventIds(allEvents, isPro);
  const frozen = isEventFrozen(event, activeEventIds, isPro);

  function goEdit() {
    if (frozen) {
      router.push('/upgrade');
      return;
    }
    router.push(`/event/${event!.id}/edit`);
  }

  const useFarsiDigits = shouldUseFarsiDigits(i18n.language);
  const { color: categoryColor, image: categoryImage } = getCategoryIcon(event.category);
  const nextOccurrence = getNextOccurrence(event.dateTimeISO, event.repeat);
  const timeString = nextOccurrence.format(prefs.timeFormat === '12h' ? 'h:mm A' : 'HH:mm');
  const dateTimeValue = `${formatCivilDateFull(nextOccurrence.toISOString(), prefs.calendar, useFarsiDigits)} · ${timeString}`;
  // Same "Happened" definition as the Events tab's own Past split (see
  // app/(tabs)/index.tsx) — a repeating event's *next* occurrence is
  // always upcoming by definition, only a one-time event can be past.
  // Editing a past event doesn't make sense (there's no future occurrence
  // left to change), so its Edit button freezes instead — same visual
  // language as a frozen widget (see widgetAccess.ts), just not Pro-gated.
  const isPast = event.repeat === 'none' && !nextOccurrence.isAfter(dayjs());
  const activeReminders = getActiveReminders(event.reminders, isPro);

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
        <Text style={[typography.bodyStrong, { color: colors.text }]}>{t('events.eventDetails')}</Text>
        {/* Same plan badge as the Events/Widgets tabs' own headers — Edit/
            Delete moved down to the pinned footer buttons, so this corner
            isn't just empty space. Free reads as a tappable "Get Pro" CTA
            (routes to /upgrade), not a neutral status label. */}
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
          {/* Opposite the title, same row — shares this event's widget
              (always captured at 'large', see shareCaptureRef) as an image
              through the native Share Sheet. */}
          <Pressable
            onPress={handleShare}
            hitSlop={12}
            accessibilityLabel={t('events.share')}
            style={[styles.headerButton, { backgroundColor: colors.surfaceAlt }]}
          >
            <Ionicons name="share-outline" size={20} color={colors.text} />
          </Pressable>
        </View>

        {/* Rendered off-screen, never visible — ViewShot needs a real
            mounted/laid-out tree to capture from, so this can't be
            conditionally skipped or display:none'd, just moved out of the
            viewport. Always 'large' regardless of event.widgetSize (see
            shareCaptureRef's own comment). */}
        <View style={styles.shareCaptureHost} collapsable={false} pointerEvents="none">
          <ViewShot ref={shareCaptureRef} options={{ format: 'png', quality: 1 }}>
            <MiniWidget event={event} size="large" />
          </ViewShot>
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
              {activeReminders.length > 0 ? t('events.reminderOn') : t('events.noReminders')}
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
              // Left over from when Pro was active and more than the free
              // offset was picked — still shown, same as a frozen widget,
              // so it's obvious the reminder still exists and just needs
              // Pro back rather than having silently vanished.
              const locked = !activeReminders.includes(offset);
              const fireAt = nextOccurrence.subtract(offset, 'minute');
              const fireTime = fireAt.format(prefs.timeFormat === '12h' ? 'h:mm A' : 'HH:mm');
              const fireValue = locked
                ? t('widgets.availableWithPro')
                : `${formatCivilDateFull(fireAt.toISOString(), prefs.calendar, useFarsiDigits)} · ${fireTime}`;
              return (
                <View key={offset} style={{ opacity: locked ? 0.55 : 1 }}>
                  <DetailRow icon={locked ? 'lock-closed' : 'notifications-outline'} label={reminderLabel(offset, t)} value={fireValue} />
                </View>
              );
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
                colors={[accents[event.accentColor], darken(accents[event.accentColor], 0.35)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.detailBadge, { borderRadius: radius.md }]}
              />
            }
          />
        </Section>

        {/* Live widget preview — same MiniWidget the wizard's Appearance
            step shows, reflecting this event's saved cardTheme/accentColor
            *and* its own widgetSize, not always "full" — this is what
            adding it to the home screen at that size will look like. */}
        <View style={{ marginTop: spacing.lg, alignItems: 'center' }}>
          <Text style={[typography.label, { color: colors.secondary, marginBottom: spacing.sm, alignSelf: 'flex-start' }]}>
            {t('widgets.widgetPreview')}
          </Text>
          <MiniWidget event={event} size={event.widgetSize ?? 'medium'} />
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingHorizontal: spacing.md, paddingBottom: insets.bottom + spacing.sm, borderTopColor: colors.outline, backgroundColor: colors.background },
        ]}
      >
        {/* Only for the over-the-limit case — a merely-past event's Edit
            needs no explanation, it's just disabled outright below. */}
        {frozen && !isPast ? (
          <Text style={[typography.caption, { color: colors.primary, textAlign: 'center', marginBottom: 6 }]}>
            {t('widgets.availableWithPro')}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row' }}>
          <Button
            label={t('events.edit')}
            variant="secondary"
            onPress={goEdit}
            disabled={isPast}
            style={{ flex: 1, marginRight: 8 }}
          />
          <Button label={t('events.delete')} variant="dangerOutline" onPress={handleDelete} style={{ flex: 1, marginLeft: 8 }} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 },
  headerButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  planBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6 },
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
  // Off-screen, not display:none — see the ViewShot host's own comment.
  shareCaptureHost: { position: 'absolute', top: 0, left: -9999 },
  // Fixed outside the ScrollView so Edit/Delete always stay visible at
  // the bottom of the screen — only the form content above scrolls. Column,
  // not row — the optional "Available with Pro" caption stacks above the
  // Edit/Delete row, which is its own nested row (see JSX).
  footer: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
