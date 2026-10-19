import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageBackground, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CivilCalendarPicker } from '../components/CivilCalendarPicker';
import { EventIcon } from '../components/EventIcon';
import { MiniWidget } from '../components/MiniWidget';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { usePro } from '../subscription';
import { CARD_THEME_KEYS, CARD_THEMES } from '../theme/cardThemes';
import { REPEAT_STYLES } from '../theme/repeatStyles';
import { usePreferences, useTheme } from '../theme/PreferencesContext';
import { accents, responsiveContent } from '../theme/tokens';
import {
  SENDER_MAX_LENGTH,
  SHARE_MESSAGE_MAX_LENGTH,
  type NotificationSoundKey,
  type RepeatRule,
  type WidgetSelection,
} from '../types/event';
import { localizeDigits, shouldUseFarsiDigits } from '../utils/calendars';
import { resolvePhotoUri } from '../utils/persistImage';
import { awaitPick } from '../utils/pickerBridge';
import { flipInRTL } from '../utils/rtl';
import { draftPreviewEvent, updateEventDraft, useEventDraft } from './eventDraft';

// The New/Edit Event wizard's Schedule / Appearance / Advanced / Share
// sections, each its own pushed screen (same pattern as reminder-picker)
// instead of expanding in place. Every edit is written straight into the
// shared draft (see eventDraft.ts), so Back keeps it — "Done" is just a
// visible way out, not a confirm step.
function SectionScreen({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 + insets.bottom, ...responsiveContent }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Card>{children}</Card>
      </ScrollView>
      <View
        style={[
          styles.footer,
          { padding: spacing.md, paddingBottom: insets.bottom + spacing.md, backgroundColor: colors.background, borderTopColor: colors.outline },
        ]}
      >
        <Button label={t('events.done')} onPress={() => router.back()} style={{ borderRadius: radius.md }} />
      </View>
    </View>
  );
}

export function ScheduleSectionScreen() {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radius, typography } = useTheme();
  const { prefs } = usePreferences();
  const { date } = useEventDraft();
  const setDate = (value: Date) => updateEventDraft({ date: value });
  const [iosTimeSheetOpen, setIosTimeSheetOpen] = useState(false);
  // Follows Preferences → Time format, like the event detail screen.
  const timeFormat = prefs.timeFormat === '12h' ? 'h:mm A' : 'HH:mm';

  function openTimePicker() {
    // Android's time picker is always a native modal dialog — no inline
    // rendering needed. iOS has no equivalent imperative API, so we render
    // an actual (spinner) DateTimePicker ourselves inside a bottom sheet.
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: date,
        mode: 'time',
        is24Hour: prefs.timeFormat !== '12h',
        onChange: (_, selected) => selected && setDate(selected),
      });
    } else {
      setIosTimeSheetOpen(true);
    }
  }

  return (
    <SectionScreen>
      {/* The native picker doesn't do a good job with any of the three
          calendars for this UI: `locale` only swaps its language/font,
          never its actual calendar system (confirmed on-device for
          '@calendar=persian' and '@calendar=islamic'), and even for
          Gregorian it doesn't match the approved calendar mockup. So all
          three use the same real calendar grid for the date, and a styled
          row (icon + label + value) for time — since time is
          calendar-agnostic, it still opens the native time picker
          underneath. */}
      <View style={{ gap: spacing.sm }}>
        <CivilCalendarPicker
          calendar={prefs.calendar}
          value={date}
          onChange={setDate}
          useFarsiDigits={shouldUseFarsiDigits(i18n.language)}
        />

        <Pressable
          onPress={openTimePicker}
          style={[styles.timeRow, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm + 4 }]}
        >
          <View style={[styles.timeIconBadge, { backgroundColor: colors.primary, borderRadius: radius.md }]}>
            <Ionicons name="time-outline" size={18} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[typography.caption, { color: colors.secondary }]}>{t('events.timeLabel')}</Text>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>{localizeDigits(dayjs(date).format(timeFormat), i18n.language)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.secondary} style={flipInRTL} />
        </Pressable>

        {Platform.OS === 'ios' && (
          <Modal visible={iosTimeSheetOpen} transparent animationType="slide" onRequestClose={() => setIosTimeSheetOpen(false)}>
            <Pressable style={styles.timeSheetBackdrop} onPress={() => setIosTimeSheetOpen(false)}>
              <Pressable
                style={[
                  styles.timeSheet,
                  {
                    backgroundColor: colors.surface,
                    borderTopLeftRadius: radius.lg,
                    borderTopRightRadius: radius.lg,
                    padding: spacing.md,
                  },
                ]}
              >
                <View style={[styles.timeSheetHandle, { backgroundColor: colors.outline }]} />
                <DateTimePicker value={date} mode="time" display="spinner" onChange={(_, selected) => selected && setDate(selected)} />
                <Button label={t('events.done')} onPress={() => setIosTimeSheetOpen(false)} style={{ marginTop: spacing.sm }} />
              </Pressable>
            </Pressable>
          </Modal>
        )}
      </View>
    </SectionScreen>
  );
}

export function AppearanceSectionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();
  const { isPro } = usePro();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const draft = useEventDraft();
  const { category, accentColor, cardTheme, customPhotoUri, customWidgetName } = draft;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Full-screen gallery (Built-in / My Widgets / Categories, search, "+ New
  // custom") — Pro can hold more than 1 custom widget, so browsing them
  // needs its own screen instead of a handful of tiles squeezed in here.
  // Resolves a WidgetSelection back via the pickerBridge; the picker
  // screen itself owns the free (1)/Pro (unlimited) quota gate.
  async function openWidgetPicker() {
    router.push({
      pathname: '/widget-picker',
      params: { eventId: eventId ?? '', category, cardTheme, photoUri: customPhotoUri ?? '' },
    });
    const picked = await awaitPick();
    const result = JSON.parse(picked) as WidgetSelection;
    updateEventDraft({
      cardTheme: result.cardTheme,
      customPhotoUri: result.customPhotoUri,
      customWidgetName: result.customWidgetName,
      customOverlayOpacity: result.customOverlayOpacity,
      customCornerStyle: result.customCornerStyle,
      customTextStyle: result.customTextStyle,
      // Undefined for a Built-in theme or Category photo (neither is a
      // saved Widget) — correctly clears whatever was set before then.
      widgetId: result.widgetId,
      ...(result.accentColor ? { accentColor: result.accentColor } : {}),
    });
  }

  return (
    <SectionScreen>
      {/* MiniWidget, not EventHeroCard — this is a preview of the actual
          home-screen widget (a single fixed Small size, see
          androidWidgetTask.tsx). */}
      <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
        <MiniWidget event={draftPreviewEvent(draft, timezone)} size="small" />
      </View>

      <Text style={[typography.label, { color: colors.secondary, marginTop: 16, marginBottom: 8 }]}>{t('events.cardThemeLabel')}</Text>

      {/* Current selection. "Change" opens the full Choose Widget gallery
          (Built-in/My Widgets/Categories, search, "+ New custom" — see
          openWidgetPicker). */}
      <Pressable onPress={openWidgetPicker} style={[styles.currentWidgetRow, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}>
        {cardTheme === 'custom' && customPhotoUri ? (
          <ImageBackground
            source={{ uri: resolvePhotoUri(customPhotoUri) }}
            style={[styles.currentWidgetThumb, { borderRadius: radius.sm, overflow: 'hidden' }]}
            imageStyle={{ borderRadius: radius.sm }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              styles.currentWidgetThumb,
              styles.currentWidgetThumbCenter,
              { borderRadius: radius.sm, backgroundColor: CARD_THEMES[cardTheme === 'custom' ? 'color' : cardTheme].background ?? accents[accentColor] },
            ]}
          >
            <EventIcon category={category} size={20} variant={CARD_THEMES[cardTheme === 'custom' ? 'color' : cardTheme].iconVariant} />
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
            {cardTheme === 'custom' ? customWidgetName || t('events.cardTheme.custom') : t(`events.cardTheme.${cardTheme}`)}
          </Text>
          <Text style={[typography.caption, { color: colors.secondary, marginTop: 2 }]}>
            {cardTheme === 'custom' ? `${t('widgets.myWidgetLabel')} · ${t('widgets.customPhotoLabel')}` : t('widgets.builtInThemeLabel')}
          </Text>
        </View>
        <Text style={[typography.bodyStrong, { color: colors.primary }]}>{t('widgets.changeWidget')}</Text>
      </Pressable>

      {/* Quick styles — one tap for the 3 built-in flats, no need to open
          the full gallery for the common case; "Browse all" opens it for
          everything else. */}
      <Text style={[typography.label, { color: colors.secondary, marginTop: 16, marginBottom: 8 }]}>{t('widgets.quickStyles')}</Text>
      <View style={styles.quickStylesRow}>
        {CARD_THEME_KEYS.map((key) => {
          const preset = CARD_THEMES[key];
          const selected = cardTheme === key;
          return (
            <Pressable key={key} style={styles.quickStyleOption} onPress={() => updateEventDraft({ cardTheme: key })}>
              <View
                style={[
                  styles.quickStyleSwatch,
                  {
                    backgroundColor: preset.background ?? accents[accentColor],
                    borderWidth: selected ? 2 : 0,
                    borderColor: colors.primary,
                  },
                ]}
              >
                {selected ? <Ionicons name="checkmark" size={16} color={preset.text} /> : null}
              </View>
              <Text style={[typography.caption, { color: selected ? colors.primary : colors.secondary, marginTop: 4 }]} numberOfLines={1}>
                {t(`events.cardTheme.${key}`)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.quickStyleOption} onPress={openWidgetPicker}>
          <View style={[styles.quickStyleSwatch, styles.browseAllSwatch, { borderColor: colors.outline, backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="grid-outline" size={16} color={colors.secondary} />
          </View>
          <Text style={[typography.caption, { color: colors.secondary, marginTop: 4 }]} numberOfLines={1}>
            {t('widgets.browseAll')}
          </Text>
        </Pressable>
      </View>

      {!isPro ? (
        <Pressable
          onPress={() => router.push('/upgrade')}
          style={[
            styles.proNote,
            { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}33`, borderRadius: radius.md, marginTop: 16 },
          ]}
        >
          <Ionicons name="lock-closed" size={14} color={colors.primary} />
          <Text style={[typography.caption, { color: colors.text, flex: 1, marginLeft: 6 }]}>{t('widgets.proNote')}</Text>
          <Text style={[typography.bodyStrong, { color: colors.primary, marginLeft: 6 }]}>{t('events.viewPro')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} style={[{ marginLeft: 2 }, flipInRTL]} />
        </Pressable>
      ) : null}
    </SectionScreen>
  );
}

export function AdvancedSectionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, radius, typography } = useTheme();
  const { date, repeat, notificationSound, note } = useEventDraft();

  async function openRepeatPicker() {
    router.push({ pathname: '/event/repeat-picker', params: { current: repeat, date: date.toISOString() } });
    const picked = await awaitPick();
    updateEventDraft({ repeat: picked as RepeatRule });
  }

  async function pickNotificationSound() {
    router.push({ pathname: '/notification-sound-picker', params: { current: notificationSound } });
    const picked = await awaitPick();
    updateEventDraft({ notificationSound: picked as NotificationSoundKey });
  }

  return (
    <SectionScreen>
      <Text style={[typography.label, { color: colors.secondary, marginBottom: 8 }]}>{t('events.repeatLabel')}</Text>
      <Pressable onPress={openRepeatPicker} style={[styles.dropdownField, { borderColor: colors.outline, borderRadius: radius.md }]}>
        <Ionicons name={REPEAT_STYLES[repeat].icon} size={18} color={REPEAT_STYLES[repeat].color} />
        <Text style={[typography.body, { color: colors.text, flex: 1, marginLeft: 10 }]}>{t(`events.repeat.${repeat}`)}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.secondary} style={flipInRTL} />
      </Pressable>

      {/* No manual title/body field — the reminder notification is always
          auto-generated (event title + note, if any + how much time is
          left, see notifications/index.ts). Sound is the only real
          per-event choice here. */}
      <Text style={[typography.label, { color: colors.secondary, marginTop: 16, marginBottom: 8 }]}>{t('events.notificationSoundLabel')}</Text>
      <Pressable onPress={pickNotificationSound} style={[styles.dropdownField, { borderColor: colors.outline, borderRadius: radius.md }]}>
        <Ionicons name="musical-notes-outline" size={18} color={colors.secondary} />
        <Text style={[typography.body, { color: colors.text, flex: 1, marginLeft: 10 }]}>{t(`events.notificationSound.${notificationSound}`)}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.secondary} style={flipInRTL} />
      </Pressable>

      <Text style={[typography.label, { color: colors.secondary, marginTop: 16, marginBottom: 8 }]}>{t('events.noteLabel')}</Text>
      <TextInput
        style={[styles.input, styles.multiline, { borderColor: colors.outline, color: colors.text, borderRadius: radius.md }]}
        placeholder={t('events.noteLabel')}
        placeholderTextColor={colors.secondary}
        value={note}
        onChangeText={(text) => updateEventDraft({ note: text })}
        multiline
      />
    </SectionScreen>
  );
}

// Everything here feeds the Share card graphic (see ShareCard.tsx /
// event/[id]/index.tsx's Share button), nothing else.
export function ShareSectionScreen() {
  const { t } = useTranslation();
  const { colors, radius, typography } = useTheme();
  const { shareMessage, sender, customVoiceUri } = useEventDraft();

  return (
    <SectionScreen>
      {/* Optional — falls back to an auto title+date line on the Share
          card when left empty, so this never blocks sharing. */}
      <Text style={[typography.label, { color: colors.secondary, marginBottom: 4 }]}>{t('events.shareMessageLabel')}</Text>
      <Text style={[typography.caption, { color: colors.secondary, marginBottom: 8 }]}>{t('events.shareMessageHint')}</Text>
      <TextInput
        style={[styles.input, styles.multiline, { borderColor: colors.outline, color: colors.text, borderRadius: radius.md }]}
        placeholder={t('events.shareMessageLabel')}
        placeholderTextColor={colors.secondary}
        value={shareMessage}
        onChangeText={(text) => updateEventDraft({ shareMessage: text.slice(0, SHARE_MESSAGE_MAX_LENGTH) })}
        maxLength={SHARE_MESSAGE_MAX_LENGTH}
        multiline
      />
      <Text style={[typography.caption, { color: colors.secondary, marginTop: 4, textAlign: 'right' }]}>
        {shareMessage.length}/{SHARE_MESSAGE_MAX_LENGTH}
      </Text>

      {/* Shown bottom-right of the Share card — a single short "from"
          line, independent of shareMessage. */}
      <Text style={[typography.label, { color: colors.secondary, marginTop: 16, marginBottom: 8 }]}>{t('events.senderLabel')}</Text>
      <TextInput
        style={[styles.input, { borderColor: colors.outline, color: colors.text, borderRadius: radius.md }]}
        placeholder={t('events.senderLabel')}
        placeholderTextColor={colors.secondary}
        value={sender}
        onChangeText={(text) => updateEventDraft({ sender: text.slice(0, SENDER_MAX_LENGTH) })}
        maxLength={SENDER_MAX_LENGTH}
      />

      <View style={{ marginTop: 16 }}>
        <VoiceRecorder uri={customVoiceUri} onChange={(uri) => updateEventDraft({ customVoiceUri: uri })} />
      </View>
    </SectionScreen>
  );
}

const styles = StyleSheet.create({
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  dropdownField: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12, minHeight: 56 },
  proNote: { flexDirection: 'row', alignItems: 'center', padding: 10, marginTop: 12, borderWidth: 1 },
  // Current selection row — thumbnail/swatch + name/subtitle + "Change".
  currentWidgetRow: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  currentWidgetThumb: { width: 48, height: 48 },
  currentWidgetThumbCenter: { alignItems: 'center', justifyContent: 'center' },
  quickStylesRow: { flexDirection: 'row', gap: 16 },
  quickStyleOption: { alignItems: 'center' },
  quickStyleSwatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  browseAllSwatch: { borderWidth: 1, borderStyle: 'dashed' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeIconBadge: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  timeSheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  timeSheet: { width: '100%', alignItems: 'stretch' },
  timeSheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
});
