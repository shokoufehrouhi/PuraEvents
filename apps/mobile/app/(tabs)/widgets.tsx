import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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

const CATEGORIES: EventCategory[] = ['personal', 'work', 'travel', 'finance', 'health', 'other'];

// This IS the Choose Widget experience (Built-in / My Widgets / Categories,
// search, "+ New custom") — a dedicated tab has room to embed it directly,
// applying every pick immediately to the previewed event (see
// applySelection), unlike the New/Edit Event wizard's Appearance section
// (a small part of a bigger form), which instead opens the same 3 tabs as
// their own screen (app/widget-picker.tsx) with a stage-then-confirm flow.
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

  // Free plan: 1 custom-photo widget total across all events (the
  // previewed event's own existing pick doesn't count against itself).
  // Pro: unlimited.
  const quotaFull =
    !isPro && myWidgets.filter((e) => e.customPhotoUri && e.id !== (isRealSample ? sample.id : undefined)).length >= FREE_LIMITS.maxWidgets;

  // Reusing a saved widget on a *different* event still spends the same
  // free-tier slot as picking a brand-new photo — only exempt from the
  // gate when it's the one this event already has (a no-op reselect).
  function selectSavedWidget(widget: PurEvent) {
    if (quotaFull && widget.customPhotoUri !== sample.customPhotoUri) {
      router.push('/paywall');
      return;
    }
    applySelection({
      cardTheme: 'custom',
      customPhotoUri: widget.customPhotoUri,
      customWidgetName: widget.customWidgetName,
      customOverlayOpacity: widget.customOverlayOpacity,
      customCornerStyle: widget.customCornerStyle,
      customTextStyle: widget.customTextStyle,
      accentColor: widget.accentColor,
    });
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
          <View style={styles.grid}>
            {filteredMyWidgets.map((widget) => {
              const selected = sample.cardTheme === 'custom' && sample.customPhotoUri === widget.customPhotoUri;
              const nextOccurrence = getNextOccurrence(widget.dateTimeISO, widget.repeat);
              const days = Math.max(0, Math.ceil(nextOccurrence.diff(dayjs(), 'hour') / 24));
              return (
                <Pressable key={widget.id} style={styles.card} onPress={() => selectSavedWidget(widget)}>
                  <ImageBackground
                    source={{ uri: widget.customPhotoUri }}
                    style={[styles.cardPhoto, { borderRadius: radius.md, borderWidth: selected ? 2 : 0, borderColor: colors.primary }]}
                    imageStyle={{ borderRadius: radius.md }}
                  >
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
                  </ImageBackground>
                  <Text style={[typography.bodyStrong, { color: colors.text, marginTop: 6, textAlign: 'center' }]} numberOfLines={1}>
                    {widget.customWidgetName || widget.title}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable style={styles.card} onPress={openNewCustom}>
              <View style={[styles.cardPhoto, styles.dashedTile, { borderRadius: radius.md, borderColor: colors.outline, backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="add" size={28} color={colors.secondary} />
                {quotaFull ? (
                  <View style={[styles.lockBadge, { backgroundColor: colors.primary, borderColor: colors.background }]}>
                    <Ionicons name="lock-closed" size={9} color="#fff" />
                  </View>
                ) : null}
              </View>
              <Text style={[typography.bodyStrong, { color: colors.secondary, marginTop: 6, textAlign: 'center' }]}>{t('widgets.newCustom')}</Text>
            </Pressable>
          </View>
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
                        <Pressable key={widget.id} style={styles.card} onPress={() => selectSavedWidget(widget)}>
                          <ImageBackground
                            source={{ uri: widget.customPhotoUri }}
                            style={[styles.cardPhoto, { borderRadius: radius.md, borderWidth: selected ? 2 : 0, borderColor: colors.primary }]}
                            imageStyle={{ borderRadius: radius.md }}
                          >
                            <View style={styles.cardScrim} />
                            <View style={styles.checkBadge}>
                              <Ionicons name={selected ? 'checkmark-circle' : 'chevron-down-circle'} size={20} color="#fff" />
                            </View>
                          </ImageBackground>
                          <Text style={[typography.bodyStrong, { color: colors.text, marginTop: 6, textAlign: 'center' }]} numberOfLines={1}>
                            {widget.customWidgetName || widget.title}
                          </Text>
                        </Pressable>
                      );
                    })}
                    {photos.map((url) => (
                      <Pressable key={url} style={styles.card} onPress={() => pickCategoryPhoto(url)}>
                        <ImageBackground
                          source={{ uri: url }}
                          style={[styles.cardPhoto, { borderRadius: radius.md, borderWidth: sample.customPhotoUri === url ? 2 : 0, borderColor: colors.primary }]}
                          imageStyle={{ borderRadius: radius.md }}
                        >
                          <View style={styles.cardScrim} />
                          {!isPro ? (
                            <View style={[styles.proBadge, { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999 }]}>
                              <Ionicons name="lock-closed" size={11} color="#fff" />
                              <Text style={styles.proBadgeText}>PRO</Text>
                            </View>
                          ) : null}
                        </ImageBackground>
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
  dashedTile: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed' },
  cardScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  checkBadge: { alignSelf: 'flex-end' },
  cardDays: { color: '#fff', fontSize: 22, fontWeight: '800' },
  cardDate: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', marginTop: 2 },
  lockBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proBadge: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  proBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
});
