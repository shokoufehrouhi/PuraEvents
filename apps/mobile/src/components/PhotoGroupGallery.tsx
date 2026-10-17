import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/PreferencesContext';
import { ACCENT_KEYS } from '../theme/tokens';
import type { PurEvent } from '../types/event';
import { getGroupPhotos, PHOTO_GROUPS, PHOTOS_PER_GROUP, thumbnailUrl, type PhotoGroup } from '../widgets/photoGroups';
import { EventIcon } from './EventIcon';
import { MiniWidget } from './MiniWidget';

interface Props {
  /** The screen's search text — narrows the sections by group name. */
  query: string;
  isPro: boolean;
  /** Remote URL of the photo picked on this screen, highlighted. */
  pickedPhotoUrl: string | null;
  /** Remote URL still being saved locally, shown with a spinner. */
  downloadingUrl: string | null;
  onPick: (url: string) => void;
}

// The "Categories" tab of both the Widgets tab and the Choose Widget
// screen: every photo group (widgets/photoGroups.ts) as its own section of
// Pro curated photos. Mounted only while that tab is open, so Pexels is
// only asked when someone actually browses it (and once a day at most).
export function PhotoGroupGallery({ query, isPro, pickedPhotoUrl, downloadingUrl, onPick }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, radius, typography } = useTheme();
  const [photos, setPhotos] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancelled = false;
    getGroupPhotos().then((map) => {
      if (!cancelled) setPhotos(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const name = (group: PhotoGroup) => (group.category ? t(`events.category.${group.category}`) : t(`photoGroups.${group.id}.name`));

  const q = query.trim().toLowerCase();
  const visibleGroups = q ? PHOTO_GROUPS.filter((g) => name(g).toLowerCase().includes(q)) : PHOTO_GROUPS;

  return (
    <>
      {visibleGroups.map((group) => {
        const urls = photos[group.id] ?? [];
        return (
          <View key={group.id} style={{ marginBottom: spacing.lg }}>
            <View style={styles.header}>
              {group.category ? (
                <EventIcon category={group.category} size={22} />
              ) : (
                <View style={[styles.iconBadge, { backgroundColor: group.color }]}>
                  <Ionicons name={group.icon!} size={13} color="#fff" />
                </View>
              )}
              <Text style={[typography.bodyStrong, { color: colors.text, marginLeft: 8 }]}>{name(group)}</Text>
            </View>
            <View style={[styles.list, { gap: spacing.md }]}>
              {/* Fixed slots, not urls.map — when Pexels returns nothing
                  (no API key, offline, no results) the missing slots still
                  render, as MiniWidget's own accent-color gradient. Colors
                  cycle per slot so a run of fallbacks isn't one flat color. */}
              {Array.from({ length: PHOTOS_PER_GROUP }).map((_, i) => {
                const url = urls[i];
                const previewEvent: PurEvent = {
                  id: `preview-${group.id}-${i}`,
                  title: t(`photoGroups.${group.id}.title`),
                  note: t(`photoGroups.${group.id}.note`),
                  dateTimeISO: dayjs().add(group.days, 'day').toISOString(),
                  timezone: 'UTC',
                  category: group.category ?? group.cardCategory ?? 'other',
                  accentColor: ACCENT_KEYS[i % ACCENT_KEYS.length],
                  cardTheme: 'custom',
                  customPhotoUri: url && thumbnailUrl(url),
                  repeat: 'none',
                  reminders: [],
                  createdAt: '',
                  updatedAt: '',
                };
                return (
                  <Pressable key={`${group.id}-${i}`} disabled={!url} onPress={() => url && onPick(url)}>
                    <View
                      style={[
                        styles.cardFrame,
                        { borderRadius: radius.lg, borderWidth: url && pickedPhotoUrl === url ? 2 : 0, borderColor: colors.primary },
                      ]}
                    >
                      <MiniWidget event={previewEvent} size="small" />
                      {url && downloadingUrl === url ? (
                        <View style={[StyleSheet.absoluteFill, styles.downloading]}>
                          <ActivityIndicator color="#fff" />
                        </View>
                      ) : null}
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
      })}
      {!isPro ? (
        <Text style={[typography.caption, { color: colors.secondary, textAlign: 'center' }]}>
          {t('widgets.premiumPerCategory', { count: PHOTOS_PER_GROUP })}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  iconBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  list: { flexDirection: 'row', flexWrap: 'wrap' },
  cardFrame: { overflow: 'hidden' },
  // Bottom-right: MiniWidget's header row already fills the top-right.
  proBadge: { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  proBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  downloading: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
});
