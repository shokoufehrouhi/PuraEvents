import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EventIcon } from '../src/components/EventIcon';
import { listEvents, updateEvent } from '../src/storage/events';
import { usePro } from '../src/subscription';
import { useTheme } from '../src/theme/PreferencesContext';
import type { EventCategory } from '../src/types/event';
import { fetchCategoryPhotos } from '../src/utils/categoryPhoto';

const CATEGORIES: EventCategory[] = ['personal', 'work', 'travel', 'finance', 'health', 'other'];

// Per-category flavor captions for the 2 sample photo tiles — decorative
// only (these tiles are a gallery to browse/pick a look, not real events),
// matching the supplied mockup's own per-tile captions.
const SAMPLE_CAPTIONS: Record<EventCategory, [string, string]> = {
  personal: ['My Birthday', 'Special Day'],
  work: ['Project Launch', 'Big Goals'],
  travel: ['Next Adventure', 'Explore More'],
  finance: ['Big Purchase', 'Saving Goal'],
  health: ['New Habit', 'Wellness Day'],
  other: ['Something New', 'Save the Date'],
};

// Pro-only gallery of curated Pexels photos per category (see
// src/utils/categoryPhoto.ts) — picking one (Pro only) applies it as a
// 'custom' cardTheme background to the current sample/most-relevant event,
// same mechanism the Widgets tab's own Custom slot uses.
export default function CategoryThemesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();
  const { isPro } = usePro();
  const [selected, setSelected] = useState<EventCategory>('personal');
  const [photos, setPhotos] = useState<Partial<Record<EventCategory, string[]>>>({});
  const [sampleEventId, setSampleEventId] = useState<string | null>(null);

  useEffect(() => {
    listEvents().then((events) => {
      const upcoming = events.find((e) => e.repeat !== 'none' || dayjs(e.dateTimeISO).isAfter(dayjs()));
      if (upcoming) setSampleEventId(upcoming.id);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all(CATEGORIES.map((c) => fetchCategoryPhotos(c, 2))).then((results) => {
      if (cancelled) return;
      const map: Partial<Record<EventCategory, string[]>> = {};
      CATEGORIES.forEach((c, i) => {
        map[c] = results[i];
      });
      setPhotos(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function pickPhoto(url: string) {
    if (!isPro) {
      router.push('/upgrade');
      return;
    }
    if (sampleEventId) await updateEvent(sampleEventId, { cardTheme: 'custom', customPhotoUri: url });
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outline }}
        contentContainerStyle={{ padding: spacing.md, gap: 8 }}
      >
        {CATEGORIES.map((c) => {
          const isSelected = selected === c;
          return (
            <Pressable
              key={c}
              onPress={() => setSelected(c)}
              style={[
                styles.pill,
                { backgroundColor: isSelected ? colors.primary : colors.surfaceAlt, borderRadius: 999 },
              ]}
            >
              <Text style={[typography.body, { color: isSelected ? '#FFFFFF' : colors.text }]}>{t(`events.category.${c}`)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        {CATEGORIES.map((category) => {
          const urls = photos[category] ?? [undefined, undefined];
          const captions = SAMPLE_CAPTIONS[category];
          return (
            <View key={category} style={{ marginBottom: spacing.lg }}>
              <View style={styles.categoryHeader}>
                <EventIcon category={category} size={26} />
                <Text style={[typography.bodyStrong, { color: colors.text, marginLeft: 8 }]}>{t(`events.category.${category}`)}</Text>
              </View>
              <View style={styles.tileRow}>
                {urls.slice(0, 2).map((url, i) => (
                  <Pressable
                    key={i}
                    disabled={!url}
                    onPress={() => url && pickPhoto(url)}
                    style={[styles.tile, { borderRadius: radius.md, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }]}
                  >
                    {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                    <View style={styles.tileScrim} />
                    {!isPro ? (
                      <View style={[styles.proBadge, { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999 }]}>
                        <Ionicons name="lock-closed" size={11} color="#fff" />
                        <Text style={styles.proBadgeText}>PRO</Text>
                      </View>
                    ) : null}
                    <View>
                      <Text style={styles.tileCaption} numberOfLines={1}>
                        {captions[i]}
                      </Text>
                      <Text style={styles.tileDays}>{(i + 1) * 10 + 2} DAYS</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}

        <Text style={[typography.caption, { color: colors.secondary, textAlign: 'center', marginTop: spacing.sm }]}>
          {t('widgets.premiumPerCategory', { count: 2 })}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 16, paddingVertical: 10 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  tileRow: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, aspectRatio: 1.15, padding: 10, justifyContent: 'flex-end' },
  tileScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  proBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  proBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  tileCaption: { color: '#fff', fontSize: 13, fontWeight: '800' },
  tileDays: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', marginTop: 2 },
});
