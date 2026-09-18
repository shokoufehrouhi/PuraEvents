import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Share from 'react-native-share';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import { useGatedAction } from '../../../src/ads/adGate';
import { ConfirmModal, type ConfirmModalState } from '../../../src/components/ConfirmModal';
import { HeroCountdown } from '../../../src/components/HeroCountdown';
import { MiniWidget } from '../../../src/components/MiniWidget';
import { ShareCard } from '../../../src/components/ShareCard';
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
import { resolveAudioUri } from '../../../src/utils/persistAudio';
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
  const gate = useGatedAction();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<PurEvent | null>(null);
  // Needed to rank this event against every other one for the free-plan
  // "only 3 editable at once" rotation below — see getActiveEventIds.
  const [allEvents, setAllEvents] = useState<PurEvent[]>([]);
  // Off-screen capture target for the Share button (see handleShare below)
  // — the ShareCard graphic, independent of the visible widget preview
  // below (see ShareCard.tsx's own fixed gift-card dimensions).
  const shareCaptureRef = useRef<ViewShotRef>(null);
  // Delete's confirm step — app-styled (ConfirmModal), not a plain OS
  // Alert.alert, to match the rest of the app's look.
  const [confirm, setConfirm] = useState<ConfirmModalState | null>(null);

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
  // flips (usePro polls every 15s), the Settings notifications toggle
  // changes, or a fresh event loads, so a lapsed plan (or a flipped
  // toggle) gets reconciled without needing to re-save the event.
  useEffect(() => {
    if (!event) return;
    scheduleRemindersForEvent(event, isPro, prefs.notificationsEnabled);
  }, [event, isPro, prefs.notificationsEnabled]);

  if (!event) return null;

  async function handleDelete() {
    setConfirm({
      title: t('events.deleteConfirmTitle'),
      message: t('events.deleteConfirmMessage', { title: event!.title }),
      confirmLabel: t('events.delete'),
      cancelLabel: t('events.cancel'),
      destructive: true,
      // Gated on the confirmed delete itself, not on opening this confirm
      // dialog — reviewing/cancelling stays available even when the ad
      // gate is unavailable, only the actual mutation is blocked.
      onConfirm: () =>
        gate(async () => {
          await cancelRemindersForEvent(event!.id);
          await deleteEvent(event!.id);
          router.back();
        }),
    });
  }

  // Captures the hidden ShareCard below (see shareCaptureRef) as a PNG and
  // hands it to the native Share Sheet — same "no fixed destination, works
  // with whatever's installed" approach as §3.5 in docs/PROJECT.md, just
  // manually-triggered rather than the auto-prompt-at-event-time version
  // described there (explicitly out of scope — the client shares it
  // manually themselves).
  //
  // No recorded voice message (see VoiceRecorder.tsx) — the common case —
  // shares the single PNG the exact same way expo-sharing always has.
  // With one, react-native-share's own `urls` (plural) takes over instead,
  // since expo-sharing only ever hands off one file: both the image and
  // the audio go out as one multi-attachment share action. react-native-
  // share's `urls` only accepts base64 data URIs, not file:// paths (see
  // its own type — unlike its single-file `url`), hence the manual
  // base64 read below.
  // Pro-only (docs/PROJECT.md §6.2) — a free user can still fill out every
  // field in the Share step (message/sender/voice, see EventWizard.tsx),
  // never blocks editing, only the actual action; tapping Share itself
  // just routes to the paywall instead, same tappable-not-disabled
  // pattern as goEdit.
  async function handleShare() {
    if (!isPro) {
      router.push('/upgrade');
      return;
    }
    try {
      const captured = await shareCaptureRef.current?.capture?.();
      if (!captured) return;

      const voiceUri = resolveAudioUri(event!.customVoiceUri);
      if (!voiceUri) {
        if (!(await Sharing.isAvailableAsync())) return;
        await Sharing.shareAsync(captured, { mimeType: 'image/png', dialogTitle: event!.title });
        return;
      }

      const [imageBase64, audioBase64] = await Promise.all([
        FileSystem.readAsStringAsync(captured, { encoding: 'base64' }),
        FileSystem.readAsStringAsync(voiceUri, { encoding: 'base64' }),
      ]);
      await Share.open({
        urls: [`data:image/png;base64,${imageBase64}`, `data:audio/m4a;base64,${audioBase64}`],
        filenames: [`${event!.title}.png`, `${event!.title}.m4a`],
        failOnCancel: false,
      });
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
        {/* Same plan badge as the Events/Widgets tabs' own headers. Free
            reads as a tappable "Get Pro" CTA (routes to /upgrade), not a
            neutral status label. */}
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
          {/* Opposite the title, same row — Edit/Delete moved to the
              pinned footer below (styles.footer) so they're reachable
              without scrolling on a long event; Share took over this spot
              instead, same single-icon-button treatment. */}
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
            viewport. A standalone "gift card"-shaped graphic (event's own
            widget look + its shareMessage/auto-fallback line), not the
            MiniWidget home-screen mockup — see ShareCard.tsx. */}
        <View style={styles.shareCaptureHost} collapsable={false} pointerEvents="none">
          <ViewShot ref={shareCaptureRef} options={{ format: 'png', quality: 1 }}>
            <ShareCard event={event} />
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
            value={`${t(`events.accent.${event.accentColor}`)} · ${t(`events.category.${event.category}`)}`}
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
            — this is what adding it to the home screen will look like
            (a single fixed Small size, see androidWidgetTask.tsx). */}
        <View style={{ marginTop: spacing.lg, alignItems: 'center' }}>
          <Text style={[typography.label, { color: colors.secondary, marginBottom: spacing.sm, alignSelf: 'flex-start' }]}>
            {t('widgets.widgetPreview')}
          </Text>
          <MiniWidget event={event} size="small" />
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingHorizontal: spacing.md, paddingBottom: insets.bottom + spacing.sm, borderTopColor: colors.outline, backgroundColor: colors.background },
        ]}
      >
        {/* Edit/Delete, not Share — Share moved up to the title row (see
            its own comment above); Add Widget moved to the Widgets tab
            (add-widget-to-home.tsx) entirely, no per-event button here at
            all. Edit still routes to /upgrade instead of the editor when
            frozen (over the free-plan "3 at once" limit) and disables
            when the event is simply past, nothing left to edit.
            dangerOutline, not a solid danger fill, for Delete — sitting
            right next to a non-destructive action, a solid red button
            would be too loud (see Button.tsx's own comment). */}
        <View style={{ flexDirection: 'row' }}>
          <Button label={t('events.edit')} variant="secondary" onPress={goEdit} disabled={isPast} style={{ flex: 1, marginRight: 8 }} />
          <Button label={t('events.delete')} variant="dangerOutline" onPress={handleDelete} style={{ flex: 1, marginLeft: 8 }} />
        </View>
      </View>

      <ConfirmModal state={confirm} onClose={() => setConfirm(null)} />
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
  // the bottom of the screen — only the form content above scrolls.
  footer: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
