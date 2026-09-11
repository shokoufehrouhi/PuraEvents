import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventIcon } from '../../src/components/EventIcon';
import { MiniWidget } from '../../src/components/MiniWidget';
import { SegmentedControl } from '../../src/components/ui/SegmentedControl';
import { listEvents, updateEvent } from '../../src/storage/events';
import { listWidgets } from '../../src/storage/widgets';
import { FREE_LIMITS, usePro } from '../../src/subscription';
import { useTheme } from '../../src/theme/PreferencesContext';
import { CARD_THEME_KEYS } from '../../src/theme/cardThemes';
import { ACCENT_KEYS } from '../../src/theme/tokens';
import type { CardTheme, EventCategory, PurEvent, Widget, WidgetSelection } from '../../src/types/event';
import { getCategoryPhotos } from '../../src/utils/categoryPhoto';
import { persistRemoteImage } from '../../src/utils/persistImage';
import { getActiveWidgetIds, isWidgetFrozen } from '../../src/utils/widgetAccess';

const SAMPLE_EVENT: PurEvent = {
  id: 'sample',
  title: 'Tokyo Trip',
  dateTimeISO: new Date(Date.now() + 18 * 86400000 + 6 * 3600000 + 24 * 60000).toISOString(),
  timezone: 'Asia/Tokyo',
  category: 'travel',
  accentColor: 'coral',
  cardTheme: 'color',
  repeat: 'none',
  reminders: [],
  createdAt: '',
  updatedAt: '',
};

type Tab = 'builtin' | 'mine' | 'categories';
type SortBy = 'name' | 'modified' | 'added';

const CATEGORIES: EventCategory[] = ['personal', 'work', 'travel', 'finance', 'health', 'other'];
const CATEGORY_PHOTO_COUNT = 4;

// Categories' Pro photo tiles aren't tied to a real event yet, so they used
// to show nothing but the photo + PRO badge — no day-count/title overlay at
// all, unlike "My Widgets" cards right above them. Cycled across each
// category's photos (4 per category, see fetchCategoryPhotos) purely for a
// realistic, varied demo look — not persisted/real data.
const SAMPLE_WIDGET_PREVIEWS: { title: string; days: number; note: string }[] = [
  { title: 'Birthday', days: 2, note: 'Order the cake' },
  { title: 'Meeting', days: 1, note: 'Bring the laptop' },
  { title: 'Trip', days: 5, note: 'Pack the passport' },
  { title: 'Reminder', days: 3, note: 'Check the guest list' },
];

// This IS the Choose Widget experience (Built-in / My Widgets / Categories,
// search, "+ New custom") — a dedicated tab has room to embed it directly.
// Built-in themes and Pro category photos apply immediately to the
// previewed event (see applySelection); a saved custom widget instead
// opens for editing (see editSavedWidget) — unlike the New/Edit Event
// wizard's own Choose Widget screen (app/widget-picker.tsx), where picking
// an existing widget copies its look onto a *different* event instead.
export default function WidgetsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();
  const { isPro } = usePro();
  const [sample, setSample] = useState<PurEvent>(SAMPLE_EVENT);
  const [tab, setTab] = useState<Tab>('mine');
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState<PurEvent[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [categoryPhotos, setCategoryPhotos] = useState<Partial<Record<EventCategory, string[]>>>({});
  const [sortBy, setSortBy] = useState<SortBy>('added');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listEvents().then((loaded) => {
        setEvents(loaded);
        const upcoming = loaded.find((e) => e.repeat !== 'none' || dayjs(e.dateTimeISO).isAfter(dayjs()));
        if (upcoming) setSample(upcoming);
      });
      listWidgets().then(setWidgets);
    }, [])
  );

  // Each saved widget (see storage/widgets.ts) paired with whichever real
  // event, if any, currently links to it (event.widgetId) — used for a
  // realistic title/date/category/note in its preview card instead of the
  // widget's own bare style fields, which don't include any of that. A
  // widget nothing currently points at (its old event switched to a
  // different photo, or it was never attached in the first place) still
  // shows up here — falls back to a generic placeholder further down.
  const widgetCards = useMemo(
    () => widgets.map((widget) => ({ widget, linkedEvent: events.find((e) => e.widgetId === widget.id) })),
    [widgets, events]
  );

  // If Pro lapses with more saved widgets than the free limit allows, only
  // the most recently *created* one(s) stay active — the rest freeze (see
  // widgetAccess.ts) instead of silently disappearing, so nothing already
  // made ever looks deleted, just locked until Pro comes back.
  const activeWidgetIds = useMemo(() => getActiveWidgetIds(widgets, isPro), [widgets, isPro]);

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

  // All 6 categories' curated photos fetched once up front (same as
  // category-themes.tsx) — the Categories tab lists every category as its
  // own section, not just one selected at a time, per the supplied design.
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

  const isRealSample = sample.id !== 'sample';

  // widgetId defaults to cleared — Built-in/Categories picks (the only two
  // callers here) aren't reusing a saved widget, so any leftover widgetId
  // from whatever this event was showing before must go too, or it'd keep
  // claiming to be "linked" to a widget it no longer displays (updateEvent
  // only overwrites fields actually present in the patch, so this has to
  // be explicit — omitting the key would silently leave the stale one).
  async function applySelection(selection: WidgetSelection) {
    const patch: WidgetSelection = { widgetId: undefined, ...selection };
    setSample((s) => ({ ...s, ...patch }));
    if (isRealSample) await updateEvent(sample.id, patch);
  }

  // Free plan: 1 saved widget total, gating only "+ New custom" (see
  // openNewCustom below) — editing an already-saved widget (editSavedWidget)
  // never needs this, it's not adding another one. Pro: unlimited.
  const quotaFull = !isPro && widgets.length >= FREE_LIMITS.maxWidgets;

  // Tapping an already-saved widget opens it for editing (Widget Name,
  // Photo, Overlay, Accent, Corner Style, Text Style — same full editor as
  // "+ New custom"), not a quick "apply this look elsewhere" — that copy
  // behavior lives in the New/Edit Event wizard's own Choose Widget screen
  // instead (see selectWidget in widget-picker.tsx), where picking a style
  // for a *different* event actually makes sense. A frozen widget (see
  // activeWidgetIds above) goes to the paywall instead of the editor.
  function editSavedWidget(widget: Widget) {
    if (isWidgetFrozen(widget, activeWidgetIds, isPro)) {
      router.push('/upgrade');
      return;
    }
    router.push({ pathname: '/custom-widget', params: { widgetId: widget.id } });
  }

  // Opens the full New Widget editor (Widget Name, Size, Overlay, Accent,
  // Corner Style, Text Style — see custom-widget.tsx) attached to the
  // previewed event — its own Save creates the Widget record and links it
  // there directly, so there's nothing left to apply here once it
  // resolves; useFocusEffect above just refetches when this tab regains
  // focus.
  function openNewCustom() {
    if (quotaFull) {
      router.push('/upgrade');
      return;
    }
    router.push({ pathname: '/custom-widget', params: { eventId: isRealSample ? sample.id : '' } });
  }

  async function pickCategoryPhoto(url: string) {
    if (!isPro) {
      router.push('/upgrade');
      return;
    }
    // Persist it locally first — it's a remote Pexels URL, not a saved
    // widget's own photo, so nothing else keeps it alive once tomorrow's
    // daily rotation drops it from the Categories tab (see getCategoryPhotos).
    const persistedUri = await persistRemoteImage(url);
    applySelection({ cardTheme: 'custom', customPhotoUri: persistedUri });
  }

  const filteredMyWidgets = useMemo(() => {
    if (!query.trim()) return widgetCards;
    const q = query.trim().toLowerCase();
    return widgetCards.filter(({ widget, linkedEvent }) => (widget.name || linkedEvent?.title || '').toLowerCase().includes(q));
  }, [widgetCards, query]);

  const sortedMyWidgets = useMemo(() => {
    const list = [...filteredMyWidgets];
    if (sortBy === 'name') {
      list.sort((a, b) => (a.widget.name || a.linkedEvent?.title || '').localeCompare(b.widget.name || b.linkedEvent?.title || ''));
    } else if (sortBy === 'modified') {
      list.sort((a, b) => b.widget.updatedAt.localeCompare(a.widget.updatedAt));
    } else {
      list.sort((a, b) => b.widget.createdAt.localeCompare(a.widget.createdAt));
    }
    return list;
  }, [filteredMyWidgets, sortBy]);

  // Searchable by category name/type, per the supplied design — typing
  // "trav" narrows the sections below to just Travel, for example.
  const visibleCategories = useMemo(() => {
    if (!query.trim()) return CATEGORIES;
    const q = query.trim().toLowerCase();
    return CATEGORIES.filter((c) => t(`events.category.${c}`).toLowerCase().includes(q));
  }, [query, t]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}>
        <View style={styles.headerRow}>
          <Text style={[typography.title, { color: colors.text }]}>{t('widgets.title')}</Text>
          {/* Free reads as a tappable "Get Pro" CTA (routes to /upgrade),
              not a neutral status label — see the Events tab's own copy
              of this badge for the full comment. */}
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

        <View style={[styles.searchBar, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, marginTop: spacing.lg }]}>
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

        {/* Built-in — the 3 flat presets, same canonical MiniWidget-format
            card as My Widgets/Categories (not a small color swatch), per
            explicit request that widget format stay identical everywhere. */}
        {tab === 'builtin' ? (
          <View style={[styles.list, { gap: spacing.md }]}>
            {CARD_THEME_KEYS.map((key) => {
              const selected = sample.cardTheme === key;
              return (
                <Pressable key={key} onPress={() => applySelection({ cardTheme: key as CardTheme })}>
                  <Text style={[typography.caption, { color: colors.secondary, marginBottom: 6 }]}>{t(`events.cardTheme.${key}`)}</Text>
                  <View style={[styles.widgetCardFrame, { borderRadius: radius.lg, borderWidth: selected ? 2 : 0, borderColor: colors.primary }]}>
                    <MiniWidget event={{ ...sample, cardTheme: key }} size="full" />
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

        {/* Own full-width row above the "My Widgets" count/list, not a
            grid tile below it — same icon badge + title/subtitle +
            trailing action grammar as the "View Pro" upsell rows
            elsewhere (Events tab's LimitBanner, the wizard's Appearance
            Pro note), not a bare dashed placeholder. */}
        {tab === 'mine' ? (
          <Pressable
            onPress={openNewCustom}
            style={[
              styles.newCustomRow,
              { borderRadius: radius.lg, marginTop: 0 },
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

        {/* My Widgets — every saved custom (photo) widget. */}
        {tab === 'mine' ? (
          <View style={styles.myWidgetsHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[typography.bodyStrong, { color: colors.text }]}>{t('widgets.myWidgets')}</Text>
              <View style={[styles.countBadge, { backgroundColor: colors.surfaceAlt, borderRadius: 999 }]}>
                <Text style={[typography.caption, { color: colors.secondary }]}>{sortedMyWidgets.length}</Text>
              </View>
            </View>
            <Pressable onPress={() => setSortMenuOpen(true)} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[typography.body, { color: colors.secondary, marginRight: 4 }]}>{t('widgets.sort')}</Text>
              <Ionicons name="swap-vertical-outline" size={16} color={colors.secondary} />
            </Pressable>
          </View>
        ) : null}

        {/* One MiniWidget-format card per row — same canonical widget
            layout (header/title/date+time/D-H-M countdown/note) used
            everywhere else a "widget" is previewed, not a bespoke
            simplified overlay, per explicit request that widget format
            stay identical everywhere. A photo grid tile can't fit that
            much content, so this is a list, not a grid. */}
        {tab === 'mine' ? (
          <View style={[styles.list, { gap: spacing.md }]}>
            {sortedMyWidgets.map(({ widget, linkedEvent }) => {
              const selected = sample.widgetId === widget.id;
              const frozen = isWidgetFrozen(widget, activeWidgetIds, isPro);
              return (
                <Pressable key={widget.id} onPress={() => editSavedWidget(widget)} style={{ opacity: frozen ? 0.55 : 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 }}>
                    <Text style={[typography.caption, { color: colors.secondary }]} numberOfLines={1}>
                      {widget.name || linkedEvent?.title}
                    </Text>
                    {/* Over the free-plan limit after Pro lapsed — see
                        activeWidgetIds above. */}
                    {frozen ? (
                      <Text style={[typography.caption, { color: colors.primary, marginLeft: 6 }]} numberOfLines={1}>
                        · {t('widgets.availableWithPro')}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.widgetCardFrame, { borderRadius: radius.lg, borderWidth: selected ? 2 : 0, borderColor: colors.primary }]}>
                    <MiniWidget event={widgetDisplayEvent(widget, linkedEvent)} size="full" />
                    {selected ? (
                      <View style={styles.selectedBadge}>
                        <Ionicons name="checkmark-circle" size={22} color="#fff" />
                      </View>
                    ) : null}
                    {frozen ? (
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
        ) : null}

        {/* Categories — every category as its own section of Pro curated
            photos only (not my own saved widgets — this tab is for
            browsing new looks, not the "my widgets" library, see the My
            Widgets tab for that), filterable via the search bar above
            instead of a single-select chip row. */}
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
                          <View style={[styles.widgetCardFrame, { borderRadius: radius.lg, borderWidth: url && sample.customPhotoUri === url ? 2 : 0, borderColor: colors.primary }]}>
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

      <Modal visible={sortMenuOpen} transparent animationType="fade" onRequestClose={() => setSortMenuOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSortMenuOpen(false)}>
          <View style={[styles.sortSheet, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
            {(['name', 'modified', 'added'] as SortBy[]).map((opt) => (
              <Pressable
                key={opt}
                onPress={() => {
                  setSortBy(opt);
                  setSortMenuOpen(false);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}
              >
                <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{t(`widgets.sortBy${opt.charAt(0).toUpperCase()}${opt.slice(1)}`)}</Text>
                {sortBy === opt ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6 },
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
  myWidgetsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 10 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sortSheet: { paddingVertical: 8, marginHorizontal: 16, marginBottom: 24 },
});
