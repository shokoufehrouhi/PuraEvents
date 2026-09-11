import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageBackground, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CivilCalendarPicker } from '../components/CivilCalendarPicker';
import { EventIcon } from '../components/EventIcon';
import { MiniWidget } from '../components/MiniWidget';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
import { scheduleRemindersForEvent } from '../notifications';
import { createEvent, getEvent, listEvents, updateEvent } from '../storage/events';
import { usePro, FREE_LIMITS } from '../subscription';
import { CARD_THEME_KEYS, CARD_THEMES } from '../theme/cardThemes';
import { REPEAT_STYLES } from '../theme/repeatStyles';
import { usePreferences, useTheme } from '../theme/PreferencesContext';
import { ACCENT_KEYS, accents, elevation, responsiveContent, type AccentKey } from '../theme/tokens';
import type { CardTheme, EventCategory, PurEvent, RepeatRule, WidgetCornerStyle, WidgetSelection, WidgetSize, WidgetTextStyle } from '../types/event';
import { formatCivilDateFull, shouldUseFarsiDigits } from '../utils/calendars';
import { resolvePhotoUri } from '../utils/persistImage';
import { awaitPick } from '../utils/pickerBridge';

type SectionKey = 'schedule' | 'reminders' | 'appearance' | 'advanced';

interface AccordionRowProps {
  title: string;
  summary: string;
  expanded: boolean;
  onPress: () => void;
  children?: ReactNode;
  // Reminders (with Pro, more than one can be picked — see reminder-picker.tsx)
  // navigates to its own push screen instead of expanding in place, same
  // "Language" row pattern as Preferences — the summary always shows (no
  // expand/collapse), the chevron always points forward, and there's no
  // inline content to expand into.
  navigate?: boolean;
}

// One collapsible row inside the grouped card below Basics — collapsed
// shows title + a one-line summary, expanded swaps the summary for the
// editable content. Matches the approved "single scrollable form" layout
// (not a paginated wizard) — see UI feedback.
function AccordionRow({ title, summary, expanded, onPress, children, navigate }: AccordionRowProps) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={{ padding: spacing.md }}>
      <Pressable onPress={onPress} style={styles.accordionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodyStrong, { color: colors.text }]}>{title}</Text>
          {navigate || !expanded ? (
            <Text style={[typography.caption, { color: colors.secondary, marginTop: 2 }]}>{summary}</Text>
          ) : null}
        </View>
        <Ionicons name={navigate ? 'chevron-forward' : expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.secondary} />
      </Pressable>
      {!navigate && expanded ? <View style={{ marginTop: spacing.sm + 4 }}>{children}</View> : null}
    </View>
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

  const [expanded, setExpanded] = useState<SectionKey | null>(null);
  const [accentOpen, setAccentOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date());
  const [category, setCategory] = useState<EventCategory>('personal');
  const [accentColor, setAccentColor] = useState<AccentKey>('coral');
  const [cardTheme, setCardTheme] = useState<CardTheme>('color');
  const [customPhotoUri, setCustomPhotoUri] = useState<string | undefined>(undefined);
  // Set via the Choose Widget screen (openWidgetPicker) — carried along so
  // reopening it later still shows the name, and so Save doesn't wipe one
  // already assigned.
  const [customWidgetName, setCustomWidgetName] = useState<string | undefined>(undefined);
  const [customOverlayOpacity, setCustomOverlayOpacity] = useState<number | undefined>(undefined);
  const [customCornerStyle, setCustomCornerStyle] = useState<WidgetCornerStyle | undefined>(undefined);
  const [customTextStyle, setCustomTextStyle] = useState<WidgetTextStyle | undefined>(undefined);
  // Which independent Widget (see storage/widgets.ts) the custom* fields
  // above are a snapshot of — see widgetId's comment on PurEvent.
  const [widgetId, setWidgetId] = useState<string | undefined>(undefined);
  // Independent of cardTheme/customPhotoUri — a Categories photo at Small
  // is just as valid as Built-in Clean at Large.
  const [widgetSize, setWidgetSize] = useState<WidgetSize>('medium');
  const [repeat, setRepeat] = useState<RepeatRule>('none');
  const [reminders, setReminders] = useState<number[]>(prefs.defaultReminderOffsets);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && eventId) {
      getEvent(eventId).then((e) => {
        if (!e) return;
        setTitle(e.title);
        setDate(new Date(e.dateTimeISO));
        setCategory(e.category);
        setAccentColor(e.accentColor);
        setCardTheme(e.cardTheme);
        setCustomPhotoUri(e.customPhotoUri);
        setCustomWidgetName(e.customWidgetName);
        setCustomOverlayOpacity(e.customOverlayOpacity);
        setCustomCornerStyle(e.customCornerStyle);
        setCustomTextStyle(e.customTextStyle);
        setWidgetId(e.widgetId);
        setWidgetSize(e.widgetSize ?? 'medium');
        setRepeat(e.repeat);
        setReminders(e.reminders);
        setNote(e.note ?? '');
      });
    }
  }, [mode, eventId]);

  const canSave = title.trim().length > 0 && !saving;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Nothing entered yet (title still blank) — the Appearance preview shows
  // this placeholder trip instead of the literal empty/just-created draft,
  // same fixed content as custom-widget.tsx's own DEFAULT_SAMPLE, so a
  // brand-new event's widget preview always reads as a real-looking card.
  const isDraftEmpty = title.trim().length === 0;
  const draftEvent: PurEvent = {
    id: 'draft',
    title: isDraftEmpty ? 'New York' : title.trim(),
    dateTimeISO: isDraftEmpty ? dayjs().add(15, 'day').toISOString() : date.toISOString(),
    timezone,
    category: isDraftEmpty ? 'travel' : category,
    accentColor,
    cardTheme,
    customPhotoUri,
    customWidgetName,
    customOverlayOpacity,
    customCornerStyle,
    customTextStyle,
    widgetId,
    widgetSize,
    repeat: isDraftEmpty ? 'none' : repeat,
    reminders,
    note: isDraftEmpty ? "Don't forget your passport" : note.trim() || undefined,
    createdAt: '',
    updatedAt: '',
  };

  function toggle(key: SectionKey) {
    setExpanded((prev) => (prev === key ? null : key));
  }

  const [iosTimeSheetOpen, setIosTimeSheetOpen] = useState(false);
  function openTimePicker() {
    // Android's time picker is always a native modal dialog — no inline
    // rendering needed. iOS has no equivalent imperative API, so we render
    // an actual (spinner) DateTimePicker ourselves inside a bottom sheet.
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: date,
        mode: 'time',
        onChange: (_, selected) => selected && setDate(selected),
      });
    } else {
      setIosTimeSheetOpen(true);
    }
  }

  async function openCategoryPicker() {
    router.push({ pathname: '/event/category-picker', params: { current: category } });
    const picked = await awaitPick();
    setCategory(picked as EventCategory);
  }

  async function openRepeatPicker() {
    router.push({ pathname: '/event/repeat-picker', params: { current: repeat, date: date.toISOString() } });
    const picked = await awaitPick();
    setRepeat(picked as RepeatRule);
  }

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
    setCardTheme(result.cardTheme);
    setCustomPhotoUri(result.customPhotoUri);
    setCustomWidgetName(result.customWidgetName);
    setCustomOverlayOpacity(result.customOverlayOpacity);
    setCustomCornerStyle(result.customCornerStyle);
    setCustomTextStyle(result.customTextStyle);
    // Undefined for a Built-in theme or Category photo (neither is a saved
    // Widget) — correctly clears whatever was set before in that case.
    setWidgetId(result.widgetId);
    if (result.accentColor) setAccentColor(result.accentColor);
  }

  // Full push screen, same simple list+checkmark pattern as language-picker
  // — independent of openWidgetPicker above, since size doesn't change what
  // style/photo the widget shows.
  async function pickWidgetSize() {
    router.push({ pathname: '/widget-size-picker', params: { current: widgetSize } });
    const picked = await awaitPick();
    setWidgetSize(picked as WidgetSize);
  }

  // Full push screen, multi-select (Pro can pick more than one) — same
  // "Language" row pattern as Widget Size above, per explicit request,
  // rather than the previous inline add/remove list. The picker screen
  // itself owns the free (1)/Pro (unlimited) quota gate.
  async function pickReminders() {
    router.push({ pathname: '/reminder-picker', params: { current: JSON.stringify(reminders) } });
    const picked = await awaitPick();
    setReminders(JSON.parse(picked) as number[]);
  }

  async function handleSave() {
    if (!canSave) return;

    if (mode === 'create') {
      const existing = await listEvents();
      if (!isPro && existing.length >= FREE_LIMITS.maxActiveEvents) {
        router.push('/upgrade');
        return;
      }
    }

    setSaving(true);
    const input = {
      title: title.trim(),
      dateTimeISO: date.toISOString(),
      timezone,
      category,
      accentColor,
      cardTheme,
      customPhotoUri,
      customWidgetName,
      customOverlayOpacity,
      customCornerStyle,
      customTextStyle,
      widgetId,
      widgetSize,
      repeat,
      reminders,
      note: note.trim() || undefined,
    };

    const saved = mode === 'edit' && eventId ? await updateEvent(eventId, input) : await createEvent(input);
    if (saved) await scheduleRemindersForEvent(saved, isPro);
    router.back();
  }

  const useFarsiDigits = shouldUseFarsiDigits(i18n.language);
  const scheduleSummary = `${formatCivilDateFull(date.toISOString(), prefs.calendar, useFarsiDigits)} • ${dayjs(date).format('h:mm A')}`;
  const remindersSummary =
    reminders.length === 0 ? t('events.noReminders') : `${reminders.length} ${t('events.remindersLabel').toLowerCase()}`;
  const appearanceSummary = t(`events.cardTheme.${cardTheme}`);
  const advancedSummary = note.trim() ? `${t(`events.repeat.${repeat}`)}, note added` : t(`events.repeat.${repeat}`);

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
      >
        {/* Basics — always visible, matches the approved layout */}
        <Card>
          <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: spacing.md }]}>{t('events.basicsHeading')}</Text>

          <Text style={[typography.label, { color: colors.secondary, marginBottom: 8 }]}>{t('events.eventNameLabel')}</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.outline, color: colors.text, borderRadius: radius.md }]}
            value={title}
            onChangeText={setTitle}
            autoFocus
            placeholderTextColor={colors.secondary}
          />

          <Text style={[typography.label, { color: colors.secondary, marginTop: 20, marginBottom: 8 }]}>{t('events.accentColorLabel')}</Text>
          <Pressable
            onPress={() => setAccentOpen((v) => !v)}
            style={[styles.dropdownField, { borderColor: colors.outline, borderRadius: radius.md }]}
          >
            <View style={[styles.dot, { backgroundColor: accents[accentColor] }]} />
            <Text style={[typography.body, { color: colors.text, flex: 1, marginLeft: 10, textTransform: 'capitalize' }]}>
              {accentColor}
            </Text>
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
                      setAccentColor(key);
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
            <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
          </Pressable>
        </Card>

        {/* Schedule / Reminders / Appearance / Advanced — grouped accordion card */}
        <View style={{ marginTop: spacing.lg }}>
          <Section>
            <AccordionRow
              title={t('events.stepSchedule')}
              summary={scheduleSummary}
              expanded={expanded === 'schedule'}
              onPress={() => toggle('schedule')}
            >
              {/* The native picker doesn't do a good job with any of the
                  three calendars for this UI: `locale` only swaps its
                  language/font, never its actual calendar system
                  (confirmed on-device for '@calendar=persian' and
                  '@calendar=islamic'), and even for Gregorian it doesn't
                  match the approved calendar mockup. So all three use the
                  same real calendar grid for the date, and a styled row
                  (icon + label + value) for time — since time is
                  calendar-agnostic, it still opens the native time picker
                  underneath. */}
              <View style={{ gap: spacing.sm }}>
                <CivilCalendarPicker calendar={prefs.calendar} value={date} onChange={setDate} useFarsiDigits={useFarsiDigits} />

                <Pressable
                  onPress={openTimePicker}
                  style={[styles.timeRow, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm + 4 }]}
                >
                  <View style={[styles.timeIconBadge, { backgroundColor: colors.primary, borderRadius: radius.md }]}>
                    <Ionicons name="time-outline" size={18} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[typography.caption, { color: colors.secondary }]}>{t('events.timeLabel')}</Text>
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>{dayjs(date).format('h:mm A')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
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
                        <DateTimePicker
                          value={date}
                          mode="time"
                          display="spinner"
                          onChange={(_, selected) => selected && setDate(selected)}
                        />
                        <Button label={t('events.done')} onPress={() => setIosTimeSheetOpen(false)} style={{ marginTop: spacing.sm }} />
                      </Pressable>
                    </Pressable>
                  </Modal>
                )}
              </View>
            </AccordionRow>

            <AccordionRow
              title={t('events.stepReminders')}
              summary={remindersSummary}
              expanded={expanded === 'reminders'}
              onPress={pickReminders}
              navigate
            />

            <AccordionRow
              title={t('events.stepAppearance')}
              summary={appearanceSummary}
              expanded={expanded === 'appearance'}
              onPress={() => toggle('appearance')}
            >
              {/* MiniWidget, not EventHeroCard — this is a preview of the
                  actual home-screen widget, so it needs to reflect Widget
                  Size below (small/medium/large render very differently,
                  not just a smaller version of the same banner). */}
              <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
                <MiniWidget event={draftEvent} size={widgetSize} />
              </View>

              <Text style={[typography.label, { color: colors.secondary, marginTop: 16, marginBottom: 8 }]}>
                {t('events.cardThemeLabel')}
              </Text>

              {/* Current selection — replaces the old inline swatch grid,
                  which didn't scale once a Pro user could hold more than 1
                  custom widget. "Change" opens the full Choose Widget
                  gallery (Built-in/My Widgets/Categories, search, "+ New
                  custom" — see openWidgetPicker). */}
              <Pressable
                onPress={openWidgetPicker}
                style={[styles.currentWidgetRow, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}
              >
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

              {/* Quick styles — one tap for the 3 built-in flats, no need
                  to open the full gallery for the common case; "Browse
                  all" opens it for everything else. */}
              <Text style={[typography.label, { color: colors.secondary, marginTop: 16, marginBottom: 8 }]}>
                {t('widgets.quickStyles')}
              </Text>
              <View style={styles.quickStylesRow}>
                {CARD_THEME_KEYS.map((key) => {
                  const preset = CARD_THEMES[key];
                  const selected = cardTheme === key;
                  return (
                    <Pressable key={key} style={styles.quickStyleOption} onPress={() => setCardTheme(key)}>
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

              {/* Independent of the style/photo above — a Categories photo
                  at Small is just as valid as Built-in Clean at Large. */}
              <Text style={[typography.label, { color: colors.secondary, marginTop: 16, marginBottom: 8 }]}>{t('widgets.widgetSize')}</Text>
              <Pressable
                onPress={pickWidgetSize}
                style={[styles.dropdownField, { borderColor: colors.outline, borderRadius: radius.md }]}
              >
                <Ionicons name="resize-outline" size={18} color={colors.secondary} />
                <Text style={[typography.body, { color: colors.text, flex: 1, marginLeft: 10 }]}>{t(`widgets.${widgetSize}`)}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
              </Pressable>

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
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} style={{ marginLeft: 2 }} />
                </Pressable>
              ) : null}
            </AccordionRow>

            <AccordionRow
              title={t('events.stepAdvanced')}
              summary={advancedSummary}
              expanded={expanded === 'advanced'}
              onPress={() => toggle('advanced')}
            >
              <Text style={[typography.label, { color: colors.secondary, marginBottom: 8 }]}>{t('events.repeatLabel')}</Text>
              <Pressable
                onPress={openRepeatPicker}
                style={[styles.dropdownField, { borderColor: colors.outline, borderRadius: radius.md }]}
              >
                <Ionicons name={REPEAT_STYLES[repeat].icon} size={18} color={REPEAT_STYLES[repeat].color} />
                <Text style={[typography.body, { color: colors.text, flex: 1, marginLeft: 10 }]}>{t(`events.repeat.${repeat}`)}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
              </Pressable>

              <Text style={[typography.label, { color: colors.secondary, marginTop: 16, marginBottom: 8 }]}>{t('events.noteLabel')}</Text>
              <TextInput
                style={[styles.input, styles.multiline, { borderColor: colors.outline, color: colors.text, borderRadius: radius.md }]}
                placeholder={t('events.noteLabel')}
                placeholderTextColor={colors.secondary}
                value={note}
                onChangeText={setNote}
                multiline
              />
            </AccordionRow>
          </Section>
        </View>
      </ScrollView>

      <View style={{ padding: spacing.md }}>
        <Button label={mode === 'create' ? t('events.createEvent') : t('events.save')} onPress={handleSave} disabled={!canSave} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dropdownField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    // Fixed so this row, the Accent Color row, and the Repeat row (all
    // share this style) stay the same height regardless of their content
    // — the bigger 32px category icon was otherwise stretching just this
    // one row taller than its neighbors.
    minHeight: 56,
  },
  // Bigger than the original 14px but not as large as the Category row's
  // 32px EventIcon — 32 read as too big, this is the midpoint.
  dot: { width: 22, height: 22, borderRadius: 11 },
  accordionHeader: { flexDirection: 'row', alignItems: 'center' },
  proNote: { flexDirection: 'row', alignItems: 'center', padding: 10, marginTop: 12, borderWidth: 1 },
  // Current selection row — thumbnail/swatch + name/subtitle + "Change".
  currentWidgetRow: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  currentWidgetThumb: { width: 48, height: 48 },
  currentWidgetThumbCenter: { alignItems: 'center', justifyContent: 'center' },
  // Quick styles — small single-tap circular swatches, not the old full
  // card-sized grid (that's the Choose Widget screen's job now).
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
