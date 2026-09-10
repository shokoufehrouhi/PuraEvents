import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EventIcon } from '../src/components/EventIcon';
import { Button } from '../src/components/ui/Button';
import { SegmentedControl } from '../src/components/ui/SegmentedControl';
import { listEvents } from '../src/storage/events';
import { FREE_LIMITS, usePro } from '../src/subscription';
import { useTheme } from '../src/theme/PreferencesContext';
import { CARD_THEME_KEYS, CARD_THEMES } from '../src/theme/cardThemes';
import { accents } from '../src/theme/tokens';
import type { CardTheme, EventCategory, PurEvent, WidgetCornerStyle, WidgetSelection, WidgetTextStyle } from '../src/types/event';
import { fetchCategoryPhotos } from '../src/utils/categoryPhoto';
import { awaitPick, resolvePick } from '../src/utils/pickerBridge';
import { getNextOccurrence } from '../src/utils/recurrence';

type Tab = 'builtin' | 'mine' | 'categories';

const CATEGORIES: EventCategory[] = ['personal', 'work', 'travel', 'finance', 'health', 'other'];

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
  const { eventId, cardTheme: currentCardTheme, photoUri: currentPhotoUri } = useLocalSearchParams<{
    eventId?: string;
    cardTheme?: string;
    photoUri?: string;
  }>();

  const [tab, setTab] = useState<Tab>('mine');
  const [query, setQuery] = useState('');
  const [myWidgets, setMyWidgets] = useState<PurEvent[]>([]);
  const [categoryPhotos, setCategoryPhotos] = useState<Partial<Record<EventCategory, string[]>>>({});

  // Staged in this screen's own local state, confirmed via "Use selected
  // widget" below — browsing tabs/searching doesn't apply anything until
  // then, matching the supplied mockup's own confirm-button flow.
  const [staged, setStaged] = useState<WidgetSelection>(() => ({
    cardTheme: (currentCardTheme as CardTheme) || 'color',
    customPhotoUri: currentPhotoUri || undefined,
  }));

  useEffect(() => {
    listEvents().then((events) => setMyWidgets(events.filter((e) => e.customPhotoUri)));
  }, []);

  // All 6 categories' curated photos fetched once up front — the
  // Categories tab lists every category as its own section, not just one
  // selected at a time, filterable via the search bar above.
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

  // Free plan: 1 custom-photo widget total across all events. Pro:
  // unlimited. Deliberately NOT excluding this event's own widget — "+ New
  // custom" means "something different from what's already here", so
  // once the limit is hit anywhere it's gated, even while editing the one
  // event that already owns it. Re-picking the exact widget already
  // staged is still a no-op — see the customPhotoUri comparison in
  // selectWidget below.
  const quotaFull = !isPro && myWidgets.length >= FREE_LIMITS.maxWidgets;

  const filteredMyWidgets = useMemo(() => {
    if (!query.trim()) return myWidgets;
    const q = query.trim().toLowerCase();
    return myWidgets.filter((w) => (w.customWidgetName || w.title).toLowerCase().includes(q));
  }, [myWidgets, query]);

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

  // Reusing a saved widget on a *different* event still spends the same
  // free-tier slot as picking a brand-new photo — only exempt from the
  // gate when it's the one already staged (a no-op reselect).
  function selectWidget(widget: PurEvent) {
    if (quotaFull && widget.customPhotoUri !== staged.customPhotoUri) {
      router.push('/paywall');
      return;
    }
    setStaged({
      cardTheme: 'custom',
      customPhotoUri: widget.customPhotoUri,
      customWidgetName: widget.customWidgetName,
      customOverlayOpacity: widget.customOverlayOpacity,
      customCornerStyle: widget.customCornerStyle,
      customTextStyle: widget.customTextStyle,
      accentColor: widget.accentColor,
    });
  }

  // Opens the full New Widget editor (draft mode — see custom-widget.tsx)
  // and, once it resolves a photo, confirms immediately instead of just
  // staging it: the editor already has its own explicit Save, so a second
  // "Use selected widget" tap right after would be redundant.
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
    confirm({
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
    setStaged({ cardTheme: 'custom', customPhotoUri: url });
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

        {tab === 'builtin' ? (
          <View style={styles.grid}>
            {CARD_THEME_KEYS.map((key) => {
              const preset = CARD_THEMES[key];
              const selected = staged.cardTheme === key;
              return (
                <Pressable key={key} style={styles.card} onPress={() => selectBuiltIn(key)}>
                  <View
                    style={[
                      styles.cardSwatch,
                      {
                        backgroundColor: preset.background ?? accents.violet,
                        borderRadius: radius.md,
                        borderWidth: selected ? 2 : 0,
                        borderColor: colors.primary,
                      },
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

        {tab === 'mine' ? (
          <View style={styles.grid}>
            {filteredMyWidgets.map((widget) => {
              const selected = staged.customPhotoUri === widget.customPhotoUri;
              const nextOccurrence = getNextOccurrence(widget.dateTimeISO, widget.repeat);
              const days = Math.max(0, Math.ceil(nextOccurrence.diff(dayjs(), 'hour') / 24));
              return (
                <Pressable key={widget.id} style={styles.card} onPress={() => selectWidget(widget)}>
                  <View style={[styles.cardPhoto, { borderRadius: radius.md, borderWidth: selected ? 2 : 0, borderColor: colors.primary }]}>
                    {/* Plain View + absolutely-filled Image, not
                        ImageBackground — ImageBackground proxies its outer
                        style's width/height onto the inner Image, and
                        aspectRatio-only sizing (no explicit height, see
                        cardPhoto) isn't reflected there, leaving the image
                        undersized/misaligned (see its own source). */}
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
            <Pressable style={styles.card} onPress={openNewCustom}>
              <View
                style={[
                  styles.cardPhoto,
                  styles.dashedTile,
                  { borderRadius: radius.md, borderColor: colors.outline, backgroundColor: colors.surfaceAlt },
                ]}
              >
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

        {/* Every category as its own section (my widgets in it, then Pro
            curated photos), filterable via the search bar above instead of
            a single-select chip row. */}
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
                      const selected = staged.customPhotoUri === widget.customPhotoUri;
                      return (
                        <Pressable key={widget.id} style={styles.card} onPress={() => selectWidget(widget)}>
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
                        <View style={[styles.cardPhoto, { borderRadius: radius.md, borderWidth: staged.customPhotoUri === url ? 2 : 0, borderColor: colors.primary }]}>
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

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.outline }]}>
        <Button label={t('widgets.useSelectedWidget')} onPress={() => confirm(staged)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth, padding: 16 },
});
