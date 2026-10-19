import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGatedAction } from '../ads/adGate';
import { EventIcon } from '../components/EventIcon';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
import { scheduleRemindersForEvent } from '../notifications';
import { createEvent, getEvent, listEvents, updateEvent } from '../storage/events';
import { usePro } from '../subscription';
import { usePreferences, useTheme } from '../theme/PreferencesContext';
import { ACCENT_KEYS, accents, elevation, responsiveContent } from '../theme/tokens';
import type { EventCategory } from '../types/event';
import { formatCivilDateFull, localizeDigits } from '../utils/calendars';
import { hasReachedFreeEventLimit } from '../utils/eventAccess';
import { awaitPick } from '../utils/pickerBridge';
import { flipInRTL } from '../utils/rtl';
import { newEventDraft, resetEventDraft, updateEventDraft, useEventDraft } from './eventDraft';

interface SectionRowProps {
  title: string;
  summary: string;
  onPress: () => void;
}

// One row inside the grouped card below Basics — title + a one-line
// summary of what's set. Each opens its own push screen (event/schedule,
// reminder-picker, event/appearance, event/advanced, event/share) instead
// of expanding in place; those screens write straight into the shared
// draft (see eventDraft.ts), so coming Back shows the new summary here.
function SectionRow({ title, summary, onPress }: SectionRowProps) {
  const { colors, spacing, typography } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.sectionRow, { padding: spacing.md }]}>
      <View style={{ flex: 1 }}>
        <Text style={[typography.bodyStrong, { color: colors.text }]}>{title}</Text>
        <Text style={[typography.caption, { color: colors.secondary, marginTop: 2 }]}>{summary}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.secondary} style={flipInRTL} />
    </Pressable>
  );
}

interface Props {
  mode: 'create' | 'edit';
  eventId?: string;
}

export function EventWizard({ mode, eventId }: Props) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { prefs } = usePreferences();
  const { isPro } = usePro();
  const gate = useGatedAction();

  // Start every wizard from a fresh draft — lazy useState init runs once,
  // before the first render reads the store.
  useState(() => resetEventDraft(newEventDraft(prefs.defaultReminderOffsets)));
  const draft = useEventDraft();
  const { title, date, category, accentColor, cardTheme, repeat, reminders, note, shareMessage, sender, customVoiceUri, notificationSound } =
    draft;
  const [accentOpen, setAccentOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && eventId) {
      getEvent(eventId).then((e) => {
        if (!e) return;
        resetEventDraft({
          title: e.title,
          date: new Date(e.dateTimeISO),
          category: e.category,
          accentColor: e.accentColor,
          cardTheme: e.cardTheme,
          customPhotoUri: e.customPhotoUri,
          customWidgetName: e.customWidgetName,
          customOverlayOpacity: e.customOverlayOpacity,
          customCornerStyle: e.customCornerStyle,
          customTextStyle: e.customTextStyle,
          widgetId: e.widgetId,
          repeat: e.repeat,
          reminders: e.reminders,
          note: e.note ?? '',
          shareMessage: e.shareMessage ?? '',
          sender: e.sender ?? '',
          customVoiceUri: e.customVoiceUri,
          notificationSound: e.notificationSound ?? 'default',
        });
      });
    }
  }, [mode, eventId]);

  const canSave = title.trim().length > 0 && !saving;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function openCategoryPicker() {
    router.push({ pathname: '/event/category-picker', params: { current: category } });
    const picked = await awaitPick();
    updateEventDraft({ category: picked as EventCategory });
  }

  // Full push screen, multi-select (Pro can pick more than one) — same
  // "Language" row pattern as Widget Size above, per explicit request,
  // rather than the previous inline add/remove list. The picker screen
  // itself owns the free (1)/Pro (unlimited) quota gate.
  async function pickReminders() {
    router.push({ pathname: '/reminder-picker', params: { current: JSON.stringify(reminders) } });
    const picked = await awaitPick();
    updateEventDraft({ reminders: JSON.parse(picked) as number[] });
  }

  async function handleSave() {
    if (!canSave) return;

    if (mode === 'create') {
      const existing = await listEvents();
      if (hasReachedFreeEventLimit(existing, isPro)) {
        router.push('/upgrade');
        return;
      }
    }

    setSaving(true);
    try {
      const input = {
        title: title.trim(),
        dateTimeISO: date.toISOString(),
        timezone,
        category,
        accentColor,
        cardTheme,
        customPhotoUri: draft.customPhotoUri,
        customWidgetName: draft.customWidgetName,
        customOverlayOpacity: draft.customOverlayOpacity,
        customCornerStyle: draft.customCornerStyle,
        customTextStyle: draft.customTextStyle,
        widgetId: draft.widgetId,
        repeat,
        reminders,
        note: note.trim() || undefined,
        shareMessage: shareMessage.trim() || undefined,
        sender: sender.trim() || undefined,
        customVoiceUri,
        notificationSound,
      };

      const saved = mode === 'edit' && eventId ? await updateEvent(eventId, input) : await createEvent(input);
      if (saved) await scheduleRemindersForEvent(saved, isPro, prefs.notificationsEnabled);
      router.back();
    } catch (error) {
      // Without this, a thrown error here (e.g. from the notification
      // scheduling call) left `saving` stuck true forever — canSave's
      // `!saving` then permanently disabled this same Save button with
      // zero feedback, silently no-op'ing every future tap even after
      // fixing whatever caused the first failure. Surface it and reset
      // instead, so at minimum the user sees *something* went wrong and
      // can try again.
      Alert.alert(t('events.saveErrorTitle'), t('events.saveErrorMessage'));
      console.error('Failed to save event', error);
    } finally {
      setSaving(false);
    }
  }

  // Follows Preferences → Time format, like the event detail screen.
  const timeFormat = prefs.timeFormat === '12h' ? 'h:mm A' : 'HH:mm';
  const scheduleSummary = `${formatCivilDateFull(date.toISOString(), prefs.calendar, i18n.language)} • ${localizeDigits(dayjs(date).format(timeFormat), i18n.language)}`;
  const remindersSummary =
    reminders.length === 0
      ? t('events.noReminders')
      : localizeDigits(t(reminders.length === 1 ? 'events.reminderCountOne' : 'events.reminderCountMany', { count: reminders.length }), i18n.language);
  const appearanceSummary = t(`events.cardTheme.${cardTheme}`);
  const advancedSummary = note.trim() ? t('events.repeatWithNote', { repeat: t(`events.repeat.${repeat}`) }) : t(`events.repeat.${repeat}`);
  const shareSummary =
    shareMessage.trim() || sender.trim() || customVoiceUri ? t('events.shareSummaryCustom') : t('events.shareSummaryAuto');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { padding: spacing.md, paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[typography.bodyStrong, { color: colors.text }]}>
          {mode === 'create' ? t('events.newEventTitle') : t('events.editEventTitle')}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 48, ...responsiveContent }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Basics — always visible, matches the approved layout */}
        <Card>
          <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.md }]}>{t('events.basicsHeading')}</Text>

          <Text style={[typography.label, { color: colors.secondary, marginBottom: 8 }]}>{t('events.eventNameLabel')}</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.outline, color: colors.text, borderRadius: radius.md }]}
            value={title}
            onChangeText={(text) => updateEventDraft({ title: text })}
            autoFocus
            placeholderTextColor={colors.secondary}
          />

          <Text style={[typography.label, { color: colors.secondary, marginTop: 20, marginBottom: 8 }]}>{t('events.accentColorLabel')}</Text>
          <Pressable
            onPress={() => setAccentOpen((v) => !v)}
            style={[styles.dropdownField, { borderColor: colors.outline, borderRadius: radius.md }]}
          >
            <View style={[styles.dot, { backgroundColor: accents[accentColor] }]} />
            <Text style={[typography.body, { color: colors.text, flex: 1, marginLeft: 10 }]}>{t(`events.accent.${accentColor}`)}</Text>
            <Ionicons name={accentOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.secondary} />
          </Pressable>
          {accentOpen ? (
            <View style={[styles.chipRow, { marginTop: 12 }]}>
              {ACCENT_KEYS.map((key) => {
                const selected = accentColor === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      updateEventDraft({ accentColor: key });
                      setAccentOpen(false);
                    }}
                    style={[
                      styles.swatch,
                      elevation.e1,
                      { backgroundColor: accents[key], borderWidth: selected ? 3 : 0, borderColor: colors.surface },
                    ]}
                  >
                    {selected ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Text style={[typography.label, { color: colors.secondary, marginTop: 20, marginBottom: 8 }]}>{t('events.categoryLabel')}</Text>
          <Pressable
            onPress={openCategoryPicker}
            style={[styles.dropdownField, { borderColor: colors.outline, borderRadius: radius.md }]}
          >
            <EventIcon category={category} size={32} />
            <Text style={[typography.body, { color: colors.text, flex: 1, marginLeft: 10 }]}>{t(`events.category.${category}`)}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.secondary} style={flipInRTL} />
          </Pressable>
        </Card>

        {/* Schedule / Reminders / Appearance / Advanced / Share — grouped card */}
        <View style={{ marginTop: spacing.lg }}>
          <Section>
            <SectionRow title={t('events.stepSchedule')} summary={scheduleSummary} onPress={() => router.push('/event/schedule')} />
            <SectionRow title={t('events.stepReminders')} summary={remindersSummary} onPress={pickReminders} />
            <SectionRow
              title={t('events.stepAppearance')}
              summary={appearanceSummary}
              onPress={() => router.push({ pathname: '/event/appearance', params: { eventId: eventId ?? '' } })}
            />
            <SectionRow title={t('events.stepAdvanced')} summary={advancedSummary} onPress={() => router.push('/event/advanced')} />
            {/* Own step, separate from Advanced — everything here feeds the
                Share card graphic (see ShareCard.tsx), nothing else. */}
            <SectionRow title={t('events.stepShare')} summary={shareSummary} onPress={() => router.push('/event/share')} />
          </Section>
        </View>
      </ScrollView>

      <View style={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.md }}>
        <Button
          label={mode === 'create' ? t('events.createEvent') : t('events.save')}
          onPress={() => gate(handleSave)}
          disabled={!canSave}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dropdownField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    // Fixed so this row and the Accent Color row (both share this style)
    // stay the same height regardless of their content — the bigger 32px
    // category icon was otherwise stretching just this one row taller.
    minHeight: 56,
  },
  // Bigger than the original 14px but not as large as the Category row's
  // 32px EventIcon — 32 read as too big, this is the midpoint.
  dot: { width: 22, height: 22, borderRadius: 11 },
  sectionRow: { flexDirection: 'row', alignItems: 'center' },
});
