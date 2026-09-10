import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventIcon } from '../../src/components/EventIcon';
import { SegmentedControl } from '../../src/components/ui/SegmentedControl';
import { listEvents, updateEvent } from '../../src/storage/events';
import { FREE_LIMITS, usePro } from '../../src/subscription';
import { useTheme } from '../../src/theme/PreferencesContext';
import { CARD_THEME_KEYS, CARD_THEMES } from '../../src/theme/cardThemes';
import { accents } from '../../src/theme/tokens';
import type { CardTheme, EventCategory, PurEvent, WidgetCornerStyle, WidgetSelection, WidgetTextStyle } from '../../src/types/event';
import { fetchCategoryPhotos } from '../../src/utils/categoryPhoto';
import { awaitPick } from '../../src/utils/pickerBridge';
import { getNextOccurrence } from '../../src/utils/recurrence';

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
  const [myWidgets, setMyWidgets] = useState<PurEvent[]>([]);
  const [categoryPhotos, setCategoryPhotos] = useState<Partial<Record<EventCategory, string[]>>>({});
  const [sortBy, setSortBy] = useState<SortBy>('added');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listEvents().then((events) => {
        const upcoming = events.find((e) => e.repeat !== 'none' || dayjs(e.dateTimeISO).isAfter(dayjs()));
        if (upcoming) setSample(upcoming);
        setMyWidgets(events.filter((e) => e.customPhotoUri));
      });
    }, [])
  );

  // All 6 categories' curated photos fetched once up front (same as
  // category-themes.tsx) — the Categories tab lists every category as its
  // own section, not just one selected at a time, per the supplied design.
  useEffect(() => {
    let cancelled = false;
    Promise.all(CATEGORIES.map((c) => fetchCategoryPhotos(c, 2))).then((results) => {
      if (cancelled) return;
      const map: Partial<Record<EventCategory, string[]>> = {};
      CATEGORIES.forEach((c, i) => {
        map[c] = results[i];
      });
      setCategoryPhotos(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isRealSample = sample.id !== 'sample';

  async function applySelection(selection: WidgetSelection) {
    setSample((s) => ({ ...s, ...selection }));
    if (isRealSample) await updateEvent(sample.id, selection);
  }

  // Free plan: 1 custom-photo widget total across all events, gating only
  // "+ New custom" (see openNewCustom below) — editing an already-saved
  // widget (editSavedWidget) never needs this, it's not adding another one.
  // Pro: unlimited.
  const quotaFull = !isPro && myWidgets.length >= FREE_LIMITS.maxWidgets;

  // Tapping an already-saved widget opens it for editing (Widget Name,
  // Photo, Overlay, Accent, Corner Style, Text Style — same full editor as
  // "+ New custom"), not a quick "apply this look elsewhere" — that copy
  // behavior lives in the New/Edit Event wizard's own Choose Widget screen
  // instead (see selectWidget in widget-picker.tsx), where picking a style
  // for a *different* event actually makes sense.
  function editSavedWidget(widget: PurEvent) {
    router.push({ pathname: '/custom-widget', params: { eventId: widget.id } });
  }

  // Opens the full New Widget editor (Widget Name, Size, Overlay, Accent,
  // Corner Style, Text Style — draft mode, see custom-widget.tsx) and
  // applies the result straight to the previewed event once it resolves.
  async function openNewCustom() {
    if (quotaFull) {
      router.push('/paywall');
      return;
    }
    router.push({ pathname: '/custom-widget', params: { draft: '1', eventId: isRealSample ? sample.id : '' } });
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
    await applySelection({
      cardTheme: 'custom',
      customPhotoUri: result.photoUri,
      customWidgetName: result.widgetName || undefined,
      customOverlayOpacity: result.overlay,
      customCornerStyle: result.corner,
      customTextStyle: result.text,
      accentColor: result.accentColor as WidgetSelection['accentColor'],
    });
  }

  function pickCategoryPhoto(url: string) {
    if (!isPro) {
      router.push('/paywall');
      return;
    }
    applySelection({ cardTheme: 'custom', customPhotoUri: url });
  }

  const filteredMyWidgets = useMemo(() => {
    if (!query.trim()) return myWidgets;
    const q = query.trim().toLowerCase();
    return myWidgets.filter((w) => (w.customWidgetName || w.title).toLowerCase().includes(q));
  }, [myWidgets, query]);

  const sortedMyWidgets = useMemo(() => {
    const list = [...filteredMyWidgets];
    if (sortBy === 'name') {
      list.sort((a, b) => (a.customWidgetName || a.title).localeCompare(b.customWidgetName || b.title));
    } else if (sortBy === 'modified') {
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } else {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
          <View style={[styles.planBadge, { backgroundColor: colors.surfaceAlt, borderRadius: 999 }]}>
            <Ionicons name={isPro ? 'diamond-outline' : 'lock-closed-outline'} size={12} color={colors.secondary} />
            <Text style={[typography.caption, { color: colors.secondary, marginLeft: 4 }]}>
              {isPro ? t('compare.pro') : t('settings.freePlan')}
            </Text>
          </View>
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

        {/* Built-in — just the 3 flat presets. */}
        {tab === 'builtin' ? (
          <View style={styles.grid}>
            {CARD_THEME_KEYS.map((key) => {
              const preset = CARD_THEMES[key];
              const selected = sample.cardTheme === key;
              return (
                <Pressable key={key} style={styles.card} onPress={() => applySelection({ cardTheme: key as CardTheme })}>
                  <View
                    style={[
                      styles.cardSwatch,
                      { backgroundColor: preset.background ?? accents[sample.accentColor], borderRadius: radius.md, borderWidth: selected ? 2 : 0, borderColor: colors.primary },
                    ]}
                  >
                    {selected ? <Ionicons name="checkmark-circle" size={22} color={preset.text} /> : null}
                  </View>
                  <Text style={[typography.bodyStrong, { color: colors.text, marginTop: 6, textAlign: 'center' }]}>{t(`events.cardTheme.${key}`)}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* My Widgets — every saved custom (photo) widget + "+ New custom". */}
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

        {tab === 'mine' ? (
          <View style={styles.grid}>
            {sortedMyWidgets.map((widget) => {
              const selected = sample.cardTheme === 'custom' && sample.customPhotoUri === widget.customPhotoUri;
              const nextOccurrence = getNextOccurrence(widget.dateTimeISO, widget.repeat);
              const days = Math.max(0, Math.ceil(nextOccurrence.diff(dayjs(), 'hour') / 24));
              return (
                <Pressable key={widget.id} style={styles.card} onPress={() => editSavedWidget(widget)}>
                  <View style={[styles.cardPhoto, { borderRadius: radius.md, borderWidth: selected ? 2 : 0, borderColor: colors.primary }]}>
                    {/* Plain View + absolutely-filled Image, not
                        ImageBackground — ImageBackground proxies its outer
                        style's width/height onto the inner Image (see its
                        own source), and aspectRatio-only sizing (no
                        explicit height, see cardPhoto) isn't reflected
                        there, leaving the image undersized/misaligned. */}
                    <Image source={{ uri: widget.customPhotoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    <View style={styles.cardScrim} />
                    {selected ? (
                      <View style={styles.checkBadge}>
                        <Ionicons name="checkmark-circle" size={20} color="#fff" />
                      </View>
                    ) : null}
                    <View>
                      <Text style={styles.cardDays}>
                        {days} {t('widgets.daysShort')}
                      </Text>
                      <Text style={styles.cardDate}>{dayjs(nextOccurrence).format('MMM D, YYYY')}</Text>
                    </View>
                  </View>
                  <Text style={[typography.bodyStrong, { color: colors.text, marginTop: 6, textAlign: 'center' }]} numberOfLines={1}>
                    {widget.customWidgetName || widget.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* Own full-width row below the grid, not a grid tile — same icon
            badge + title/subtitle + trailing action grammar as the "View
            Pro" upsell rows elsewhere (Events tab's LimitBanner, the
            wizard's Appearance Pro note), not a bare dashed placeholder. */}
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

        {/* Categories — every category as its own section (my widgets in
            it, then Pro curated photos), filterable via the search bar
            above instead of a single-select chip row. */}
        {tab === 'categories'
          ? visibleCategories.map((category) => {
              const widgetsInCategory = myWidgets.filter((w) => w.category === category);
              const photos = categoryPhotos[category] ?? [];
              return (
                <View key={category} style={{ marginBottom: spacing.lg }}>
                  <View style={styles.categoryHeader}>
                    <EventIcon category={category} size={22} />
                    <Text style={[typography.bodyStrong, { color: colors.text, marginLeft: 8 }]}>{t(`events.category.${category}`)}</Text>
                  </View>
                  <View style={styles.grid}>
                    {widgetsInCategory.map((widget) => {
                      const selected = sample.cardTheme === 'custom' && sample.customPhotoUri === widget.customPhotoUri;
                      return (
                        <Pressable key={widget.id} style={styles.card} onPress={() => editSavedWidget(widget)}>
                          <View style={[styles.cardPhoto, { borderRadius: radius.md, borderWidth: selected ? 2 : 0, borderColor: colors.primary }]}>
                            <Image source={{ uri: widget.customPhotoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                            <View style={styles.cardScrim} />
                            <View style={styles.checkBadge}>
                              <Ionicons name={selected ? 'checkmark-circle' : 'chevron-down-circle'} size={20} color="#fff" />
                            </View>
                          </View>
                          <Text style={[typography.bodyStrong, { color: colors.text, marginTop: 6, textAlign: 'center' }]} numberOfLines={1}>
                            {widget.customWidgetName || widget.title}
                          </Text>
                        </Pressable>
                      );
                    })}
                    {photos.map((url) => (
                      <Pressable key={url} style={styles.card} onPress={() => pickCategoryPhoto(url)}>
                        <View style={[styles.cardPhoto, { borderRadius: radius.md, borderWidth: sample.customPhotoUri === url ? 2 : 0, borderColor: colors.primary }]}>
                          <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                          <View style={styles.cardScrim} />
                          {!isPro ? (
                            <View style={[styles.proBadge, { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999 }]}>
                              <Ionicons name="lock-closed" size={11} color="#fff" />
                              <Text style={styles.proBadgeText}>PRO</Text>
                            </View>
                          ) : null}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })
          : null}
        {tab === 'categories' && !isPro ? (
          <Text style={[typography.caption, { color: colors.secondary, textAlign: 'center' }]}>
            {t('widgets.premiumPerCategory', { count: 2 })}
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '47%', alignItems: 'center' },
  cardSwatch: { width: '100%', aspectRatio: 1.15, alignItems: 'center', justifyContent: 'center' },
  cardPhoto: { width: '100%', aspectRatio: 1.15, padding: 10, justifyContent: 'space-between', overflow: 'hidden' },
  newCustomRow: { width: '100%', flexDirection: 'row', alignItems: 'center', padding: 14, marginTop: 12 },
  newCustomIconBadge: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  cardScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  checkBadge: { alignSelf: 'flex-end' },
  cardDays: { color: '#fff', fontSize: 22, fontWeight: '800' },
  cardDate: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', marginTop: 2 },
  proBadge: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  proBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  myWidgetsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sortSheet: { paddingVertical: 8, marginHorizontal: 16, marginBottom: 24 },
});
