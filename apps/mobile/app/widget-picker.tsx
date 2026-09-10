import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EventIcon } from '../src/components/EventIcon';
import { MiniWidget } from '../src/components/MiniWidget';
import { Button } from '../src/components/ui/Button';
import { SegmentedControl } from '../src/components/ui/SegmentedControl';
import { listEvents } from '../src/storage/events';
import { createWidget, listWidgets } from '../src/storage/widgets';
import { FREE_LIMITS, usePro } from '../src/subscription';
import { useTheme } from '../src/theme/PreferencesContext';
import { CARD_THEME_KEYS } from '../src/theme/cardThemes';
import { ACCENT_KEYS } from '../src/theme/tokens';
import type { CardTheme, EventCategory, PurEvent, Widget, WidgetCornerStyle, WidgetSelection, WidgetTextStyle } from '../src/types/event';
import { getCategoryPhotos } from '../src/utils/categoryPhoto';
import { awaitPick, resolvePick } from '../src/utils/pickerBridge';
import { persistRemoteImage } from '../src/utils/persistImage';

type Tab = 'builtin' | 'mine' | 'categories';

const CATEGORIES: EventCategory[] = ['personal', 'work', 'travel', 'finance', 'health', 'other'];
const CATEGORY_PHOTO_COUNT = 4;

// Same demo overlay as the Widgets tab's own Categories section (see
// app/(tabs)/widgets.tsx) — Pro photo tiles aren't tied to a real event, so
// cycle a small set of varied sample title/day-count pairs across each
// category's photos purely for a realistic look, not persisted/real data.
const SAMPLE_WIDGET_PREVIEWS: { title: string; days: number; note: string }[] = [
  { title: 'Birthday', days: 2, note: 'Order the cake' },
  { title: 'Meeting', days: 1, note: 'Bring the laptop' },
  { title: 'Trip', days: 5, note: 'Pack the passport' },
  { title: 'Reminder', days: 3, note: 'Check the guest list' },
];

// Full-screen "gallery" replacement for the old inline swatch row — Pro can
// hold more than 1 custom widget, so browsing/searching/picking one needs
// its own screen instead of a handful of tiles squeezed into an accordion.
// Opened from both the New/Edit Event wizard's Appearance section and the
// Widgets tab (see openWidgetPicker in each) with the event's current
// look, category, and id (so quota/self-exclusion work); resolves a
// WidgetSelection back via the pickerBridge on "Use selected widget".
export default function WidgetPickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();
  const { isPro } = usePro();
  const { eventId, cardTheme: currentCardTheme, photoUri: currentPhotoUri, category: currentCategory } = useLocalSearchParams<{
    eventId?: string;
    cardTheme?: string;
    photoUri?: string;
    category?: string;
  }>();

  const [tab, setTab] = useState<Tab>('mine');
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState<PurEvent[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [categoryPhotos, setCategoryPhotos] = useState<Partial<Record<EventCategory, string[]>>>({});
  // The event actually being edited (eventId), when it already exists —
  // gives the Built-in tab's preview cards the real title/date/note
  // instead of made-up placeholder text. Null for a brand-new event
  // (still being created, no id yet) or while still loading.
  const [targetEvent, setTargetEvent] = useState<PurEvent | null>(null);

  // Staged in this screen's own local state, confirmed via "Use selected
  // widget" below — browsing tabs/searching doesn't apply anything until
  // then, matching the supplied mockup's own confirm-button flow.
  const [staged, setStaged] = useState<WidgetSelection>(() => ({
    cardTheme: (currentCardTheme as CardTheme) || 'color',
    customPhotoUri: currentPhotoUri || undefined,
  }));

  useEffect(() => {
    listEvents().then((loaded) => {
      setEvents(loaded);
      if (eventId) setTargetEvent(loaded.find((e) => e.id === eventId) ?? null);
    });
    listWidgets().then(setWidgets);
  }, [eventId]);

  // Each saved widget paired with whichever real event, if any, currently
  // links to it — see the identical pairing in app/(tabs)/widgets.tsx for
  // why (a realistic preview card, and staying visible even when nothing
  // currently points at it).
  const widgetCards = useMemo(
    () => widgets.map((widget) => ({ widget, linkedEvent: events.find((e) => e.widgetId === widget.id) })),
    [widgets, events]
  );

  function widgetDisplayEvent(widget: Widget, linkedEvent?: PurEvent): PurEvent {
    const base: PurEvent =
      linkedEvent ?? {
        id: `widget-${widget.id}`,
        title: widget.name || 'Widget',
        dateTimeISO: dayjs().add(7, 'day').toISOString(),
        timezone: 'UTC',
        category: 'other',
        accentColor: widget.accentColor ?? 'violet',
        cardTheme: 'custom',
        repeat: 'none',
        reminders: [],
        createdAt: widget.createdAt,
        updatedAt: widget.updatedAt,
      };
    return {
      ...base,
      cardTheme: 'custom',
      customPhotoUri: widget.photoUri,
      customWidgetName: widget.name,
      customOverlayOpacity: widget.overlayOpacity,
      customCornerStyle: widget.cornerStyle,
      customTextStyle: widget.textStyle,
      accentColor: widget.accentColor ?? base.accentColor,
    };
  }

  // Placeholder content for the Built-in tab's preview cards when there's
  // no real event yet (still creating one) — same "New York" placeholder
  // convention as custom-widget.tsx's own DEFAULT_SAMPLE, for consistency.
  const previewBase: PurEvent =
    targetEvent ?? {
      id: 'preview',
      title: 'New York',
      note: "Don't forget your passport",
      dateTimeISO: dayjs().add(15, 'day').toISOString(),
      timezone: 'UTC',
      category: (currentCategory as EventCategory) || 'travel',
      accentColor: 'coral',
      cardTheme: 'color',
      repeat: 'none',
      reminders: [],
      createdAt: '',
      updatedAt: '',
    };

  // All 6 categories' curated photos fetched once up front — the
  // Categories tab lists every category as its own section, not just one
  // selected at a time, filterable via the search bar above.
  // getCategoryPhotos caches the result for the whole day, so this only
  // hits Pexels once per day, not once per mount.
  useEffect(() => {
    let cancelled = false;
    getCategoryPhotos(CATEGORIES, CATEGORY_PHOTO_COUNT).then((map) => {
      if (cancelled) return;
      setCategoryPhotos(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Free plan: 1 saved widget total. Pro: unlimited. Picking an existing
  // widget (selectWidget below) is never gated by this — it doesn't create
  // another one, just reuses/links the one already saved.
  const quotaFull = !isPro && widgets.length >= FREE_LIMITS.maxWidgets;

  const filteredMyWidgets = useMemo(() => {
    if (!query.trim()) return widgetCards;
    const q = query.trim().toLowerCase();
    return widgetCards.filter(({ widget, linkedEvent }) => (widget.name || linkedEvent?.title || '').toLowerCase().includes(q));
  }, [widgetCards, query]);

  // Searchable by category name/type — typing "trav" narrows the sections
  // below to just Travel, for example.
  const visibleCategories = useMemo(() => {
    if (!query.trim()) return CATEGORIES;
    const q = query.trim().toLowerCase();
    return CATEGORIES.filter((c) => t(`events.category.${c}`).toLowerCase().includes(q));
  }, [query, t]);

  function confirm(selection: WidgetSelection) {
    resolvePick(JSON.stringify(selection));
    router.back();
  }

  function selectBuiltIn(key: Exclude<CardTheme, 'custom'>) {
    setStaged({ cardTheme: key });
  }

  // Picking a widget you *already* made and applying it here is never
  // gated, even on the free plan at its 1-widget cap — it doesn't create
  // another one, just links the same saved widget onto this event too.
  // Every event that links a widget shows the same look, but "My Widgets"
  // still only ever lists it once (see storage/widgets.ts) — nothing here
  // needs to touch whichever *other* event(s) already link it.
  function selectWidget(widget: Widget) {
    setStaged({
      cardTheme: 'custom',
      customPhotoUri: widget.photoUri,
      customWidgetName: widget.name,
      customOverlayOpacity: widget.overlayOpacity,
      customCornerStyle: widget.cornerStyle,
      customTextStyle: widget.textStyle,
      accentColor: widget.accentColor,
      widgetId: widget.id,
    });
  }

  // Opens the full New Widget editor (draft mode — see custom-widget.tsx,
  // needed here since there may not be a real saved event yet to attach
  // to). Once it resolves a photo, creates the actual independent Widget
  // record right away (not deferred to whenever/if the wizard's own event
  // save happens — a widget doesn't need an event to exist, see
  // storage/widgets.ts) and confirms immediately instead of just staging
  // it: the editor already has its own explicit Save, so a second "Use
  // selected widget" tap right after would be redundant.
  async function openNewCustom() {
    if (quotaFull) {
      router.push('/paywall');
      return;
    }
    router.push({ pathname: '/custom-widget', params: { draft: '1', eventId: eventId || '' } });
    const picked = await awaitPick();
    const result = JSON.parse(picked) as {
      photoUri?: string;
      widgetName?: string;
      overlay?: number;
      corner?: WidgetCornerStyle;
      text?: WidgetTextStyle;
      accentColor?: string;
    };
    if (!result.photoUri) return;
    const widget = await createWidget({
      name: result.widgetName || undefined,
      photoUri: result.photoUri,
      overlayOpacity: result.overlay,
      cornerStyle: result.corner,
      textStyle: result.text,
      accentColor: result.accentColor as WidgetSelection['accentColor'],
    });
    confirm({
      cardTheme: 'custom',
      customPhotoUri: widget.photoUri,
      customWidgetName: widget.name,
      customOverlayOpacity: widget.overlayOpacity,
      customCornerStyle: widget.cornerStyle,
      customTextStyle: widget.textStyle,
      accentColor: widget.accentColor,
      widgetId: widget.id,
    });
  }

  async function pickCategoryPhoto(url: string) {
    if (!isPro) {
      router.push('/paywall');
      return;
    }
    // Persist it locally first — it's a remote Pexels URL, not a saved
    // widget's own photo, so nothing else keeps it alive once tomorrow's
    // daily rotation drops it from the Categories tab (see getCategoryPhotos).
    const persistedUri = await persistRemoteImage(url);
    setStaged({ cardTheme: 'custom', customPhotoUri: persistedUri });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}>
        <View style={[styles.searchBar, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}>
          <Ionicons name="search" size={16} color={colors.secondary} />
          <TextInput
            style={[typography.body, styles.searchInput, { color: colors.text }]}
            placeholder={t('widgets.searchWidgets')}
            placeholderTextColor={colors.secondary}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <View style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: 'builtin' as Tab, label: t('widgets.builtIn') },
              { value: 'mine' as Tab, label: t('widgets.myWidgets') },
              { value: 'categories' as Tab, label: t('widgets.categoriesTab') },
            ]}
          />
        </View>

        {/* Same canonical MiniWidget-format card as My Widgets/Categories
            (not a small color swatch), per explicit request that widget
            format stay identical everywhere — previewed against the real
            event being edited when there is one, a placeholder otherwise. */}
        {tab === 'builtin' ? (
          <View style={[styles.list, { gap: spacing.md }]}>
            {CARD_THEME_KEYS.map((key) => {
              const selected = staged.cardTheme === key;
              return (
                <Pressable key={key} onPress={() => selectBuiltIn(key)}>
                  <Text style={[typography.caption, { color: colors.secondary, marginBottom: 6 }]}>{t(`events.cardTheme.${key}`)}</Text>
                  <View style={[styles.widgetCardFrame, { borderRadius: radius.lg, borderWidth: selected ? 2 : 0, borderColor: colors.primary }]}>
                    <MiniWidget event={{ ...previewBase, cardTheme: key }} size="full" />
                    {selected ? (
                      <View style={styles.selectedBadge}>
                        <Ionicons name="checkmark-circle" size={22} color="#fff" />
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* One MiniWidget-format card per row — same canonical widget
            layout (header/title/date+time/D-H-M countdown/note) used
            everywhere else a "widget" is previewed, per explicit request
            that widget format stay identical everywhere. */}
        {tab === 'mine' ? (
          <View style={[styles.list, { gap: spacing.md }]}>
            {filteredMyWidgets.map(({ widget, linkedEvent }) => {
              const selected = staged.widgetId === widget.id;
              return (
                <Pressable key={widget.id} onPress={() => selectWidget(widget)}>
                  <Text style={[typography.caption, { color: colors.secondary, marginBottom: 6 }]} numberOfLines={1}>
                    {widget.name || linkedEvent?.title}
                  </Text>
                  <View style={[styles.widgetCardFrame, { borderRadius: radius.lg, borderWidth: selected ? 2 : 0, borderColor: colors.primary }]}>
                    <MiniWidget event={widgetDisplayEvent(widget, linkedEvent)} size="full" />
                    {selected ? (
                      <View style={styles.selectedBadge}>
                        <Ionicons name="checkmark-circle" size={22} color="#fff" />
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* Own full-width row below the list, not a grid tile — same icon
            badge + title/subtitle + trailing action grammar as the "New
            custom" row in the Widgets tab (see app/(tabs)/widgets.tsx). */}
        {tab === 'mine' ? (
          <Pressable
            onPress={openNewCustom}
            style={[
              styles.newCustomRow,
              { borderRadius: radius.lg },
              quotaFull
                ? { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}33`, borderWidth: 1 }
                : { backgroundColor: colors.surfaceAlt, borderColor: colors.outline, borderWidth: 1, borderStyle: 'dashed' },
            ]}
          >
            <View
              style={[
                styles.newCustomIconBadge,
                { backgroundColor: quotaFull ? `${colors.primary}22` : colors.surface, borderRadius: 999 },
              ]}
            >
              <Ionicons name={quotaFull ? 'lock-closed' : 'add'} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[typography.bodyStrong, { color: colors.text }]}>{t('widgets.newCustom')}</Text>
              {quotaFull ? (
                <Text style={[typography.caption, { color: colors.secondary, marginTop: 2 }]}>{t('widgets.availableWithPro')}</Text>
              ) : null}
            </View>
            {quotaFull ? (
              <Text style={[typography.bodyStrong, { color: colors.primary }]}>{t('events.viewPro')}</Text>
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
            )}
          </Pressable>
        ) : null}

        {/* Every category as its own section of Pro curated photos only
            (not my own saved widgets — this tab is for browsing new
            looks, not the "My Widgets" library), filterable via the
            search bar above instead of a single-select chip row. */}
        {tab === 'categories'
          ? visibleCategories.map((category) => {
              const photos = categoryPhotos[category] ?? [];
              return (
                <View key={category} style={{ marginBottom: spacing.lg }}>
                  <View style={styles.categoryHeader}>
                    <EventIcon category={category} size={22} />
                    <Text style={[typography.bodyStrong, { color: colors.text, marginLeft: 8 }]}>{t(`events.category.${category}`)}</Text>
                  </View>
                  <View style={[styles.list, { gap: spacing.md }]}>
                    {/* Fixed CATEGORY_PHOTO_COUNT slots, not photos.map —
                        when Pexels returns nothing (no API key, offline, no
                        results) or fewer than requested, the missing slots
                        still render as a card (url undefined), which
                        MiniWidget itself falls back to its own accent-color
                        gradient for. Colors cycled per slot (ACCENT_KEYS)
                        so a whole run of fallbacks isn't one flat color. */}
                    {Array.from({ length: CATEGORY_PHOTO_COUNT }).map((_, i) => {
                      const url = photos[i];
                      const preview = SAMPLE_WIDGET_PREVIEWS[i % SAMPLE_WIDGET_PREVIEWS.length];
                      const previewEvent: PurEvent = {
                        id: `preview-${category}-${i}`,
                        title: preview.title,
                        note: preview.note,
                        dateTimeISO: dayjs().add(preview.days, 'day').toISOString(),
                        timezone: 'UTC',
                        category,
                        accentColor: ACCENT_KEYS[i % ACCENT_KEYS.length],
                        cardTheme: 'custom',
                        customPhotoUri: url,
                        repeat: 'none',
                        reminders: [],
                        createdAt: '',
                        updatedAt: '',
                      };
                      return (
                        <Pressable key={`${category}-${i}`} disabled={!url} onPress={() => url && pickCategoryPhoto(url)}>
                          <View style={[styles.widgetCardFrame, { borderRadius: radius.lg, borderWidth: url && staged.customPhotoUri === url ? 2 : 0, borderColor: colors.primary }]}>
                            <MiniWidget event={previewEvent} size="full" />
                            {!isPro && url ? (
                              <View style={[styles.proBadge, { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999 }]}>
                                <Ionicons name="lock-closed" size={11} color="#fff" />
                                <Text style={styles.proBadgeText}>PRO</Text>
                              </View>
                            ) : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })
          : null}
        {tab === 'categories' && !isPro ? (
          <Text style={[typography.caption, { color: colors.secondary, textAlign: 'center' }]}>
            {t('widgets.premiumPerCategory', { count: 4 })}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.outline }]}>
        <Button label={t('widgets.useSelectedWidget')} onPress={() => confirm(staged)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16, height: '100%' },
  // One full-width MiniWidget card per row — see "My Widgets"/Categories
  // rendering above. overflow:'hidden' clips MiniWidget's own corner
  // radius to this frame's selection-border radius.
  list: { flexDirection: 'column' },
  widgetCardFrame: { overflow: 'hidden' },
  newCustomRow: { width: '100%', flexDirection: 'row', alignItems: 'center', padding: 14, marginTop: 12 },
  newCustomIconBadge: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  // Float on top of the MiniWidget card, not a flex sibling pushed into
  // place — MiniWidget owns its own internal layout now.
  selectedBadge: { position: 'absolute', bottom: 10, right: 10 },
  // Bottom-right, not top-right — MiniWidget's own header row already
  // fills that corner with the repeat label ("Does not repeat" etc.), so
  // top-right collides with it. Bottom-right stays clear of that plus the
  // countdown numbers and the (short, left-aligned) note.
  proBadge: { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  proBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth, padding: 16 },
});
