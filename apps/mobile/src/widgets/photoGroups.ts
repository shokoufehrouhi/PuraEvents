import type { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ComponentProps } from 'react';

import type { EventCategory } from '../types/event';
import { fetchPhotos } from '../utils/categoryPhoto';

// The photo groups in the Widgets "Categories" tab (Pro): the event
// categories first, then extra themed groups that aren't event categories
// themselves, with "Other" last. Each is one Pexels search ("minimal ..."
// keeps the photo calm enough to read the widget text on top, see
// categoryPhoto.ts). The names
// and the sample title/note on each card are translated under photoGroups.*.

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface PhotoGroup {
  id: string;
  query: string;
  /** Event categories show their own artwork; the rest an Ionicons badge. */
  category?: EventCategory;
  icon?: IconName;
  color?: string;
  /** The event category the sample cards show, for the extra groups. */
  cardCategory?: EventCategory;
  /** Days left on the sample card. */
  days: number;
}

export const PHOTO_GROUPS: PhotoGroup[] = [
  { id: 'personal', category: 'personal', query: 'minimal balloons pastel', days: 2 },
  { id: 'work', category: 'work', query: 'minimal desk workspace', days: 1 },
  { id: 'travel', category: 'travel', query: 'minimal landscape', days: 3 },
  { id: 'finance', category: 'finance', query: 'minimal money savings', days: 5 },
  { id: 'health', category: 'health', query: 'minimal wellness', days: 4 },
  { id: 'birthday', cardCategory: 'personal', icon: 'gift', color: '#E86FB0', query: 'minimal birthday cake', days: 6 },
  { id: 'love', cardCategory: 'personal', icon: 'heart', color: '#E5534B', query: 'minimal roses romantic', days: 12 },
  { id: 'celebration', cardCategory: 'personal', icon: 'sparkles', color: '#EE9B3A', query: 'minimal festive lights bokeh', days: 20 },
  { id: 'baby', cardCategory: 'personal', icon: 'happy', color: '#4FA3E0', query: 'minimal baby nursery soft', days: 45 },
  { id: 'study', cardCategory: 'work', icon: 'school', color: '#6558D9', query: 'minimal books study', days: 9 },
  { id: 'sport', cardCategory: 'health', icon: 'barbell', color: '#2FA36B', query: 'minimal running fitness', days: 14 },
  { id: 'nature', cardCategory: 'travel', icon: 'leaf', color: '#3E9B5A', query: 'minimal forest green', days: 8 },
  { id: 'beach', cardCategory: 'travel', icon: 'sunny', color: '#1EA7B8', query: 'minimal beach ocean', days: 25 },
  { id: 'city', cardCategory: 'travel', icon: 'business', color: '#5C6B80', query: 'minimal city skyline', days: 10 },
  { id: 'winter', cardCategory: 'travel', icon: 'snow', color: '#5B8DEF', query: 'minimal snow winter', days: 30 },
  { id: 'other', category: 'other', query: 'minimal abstract pattern', days: 2 },
];

export const PHOTOS_PER_GROUP = 4;

/** A small square version of a Pexels photo for the gallery cards. The
 *  full-size one (large2x, ~1300px) is only downloaded once picked: 64 of
 *  those decoded at once overflow Android's image memory pool and the
 *  later groups fail to show. */
export function thumbnailUrl(url: string): string {
  if (!url.startsWith('https://images.pexels.com/')) return url;
  return `${url.split('?')[0]}?auto=compress&cs=tinysrgb&fit=crop&w=480&h=480`;
}

const CACHE_KEY = 'puraevents:photoGroupsCache';
// Pexels result pages to rotate through, one per day.
const PAGE_COUNT = 5;

interface Cache {
  date: string; // local YYYY-MM-DD
  photos: Record<string, string[]>;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Same date → same page, so the gallery is a stable daily pick.
function pageFor(date: string): number {
  let hash = 0;
  for (let i = 0; i < date.length; i++) hash = (hash * 31 + date.charCodeAt(i)) >>> 0;
  return 1 + (hash % PAGE_COUNT);
}

/** Today's photos for every group, from the daily cache when there.
 *  Only groups missing from today's cache (or that came back empty) are
 *  fetched again, so adding a group doesn't refetch the others. */
export async function getGroupPhotos(): Promise<Record<string, string[]>> {
  const today = todayKey();
  let cached: Record<string, string[]> = {};
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const parsed: Cache | null = raw ? JSON.parse(raw) : null;
    if (parsed?.date === today) cached = parsed.photos;
  } catch {
    // Unreadable cache: fetch everything again.
  }

  const missing = PHOTO_GROUPS.filter((g) => !cached[g.id]?.length);
  if (!missing.length) return cached;

  const page = pageFor(today);
  const results = await Promise.all(missing.map((g) => fetchPhotos(g.query, PHOTOS_PER_GROUP, page)));
  const photos = { ...cached };
  missing.forEach((g, i) => {
    photos[g.id] = results[i];
  });
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, photos } satisfies Cache));
  } catch {
    // Best effort; today's photos still come back below.
  }
  return photos;
}
