// Curated Pexels search terms for the Widgets tab's Pro "category photo"
// gallery (4 photos per category, locked behind Pro) — same Pexels API
// already used for the Events tab's location-photo hero banner (see
// locationPhoto.ts), just keyed by category instead of place name.
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { EventCategory } from '../types/event';

// Prefixed with "minimal" on purpose — these photos sit behind a widget
// card's title/countdown/note text (see MiniWidget.tsx), so a busy photo
// (the old 'celebration confetti' for personal, for instance) actively
// hurts legibility, not just looks cluttered. Simpler/calmer subjects per
// category, not just "confetti"/"desk"/etc.
const CATEGORY_SEARCH_TERMS: Record<EventCategory, string> = {
  personal: 'minimal balloons pastel',
  work: 'minimal desk workspace',
  travel: 'minimal landscape',
  finance: 'minimal money savings',
  health: 'minimal wellness',
  other: 'minimal abstract pattern',
};

// Returns up to `count` distinct photo URLs for a category, or [] on any
// failure (missing API key, offline, no results) — callers just show
// nothing/a placeholder for that category rather than crashing. `page`
// picks which page of Pexels results to pull, so the same query can
// return a different set on a different day (see getCategoryPhotos below).
export async function fetchCategoryPhotos(category: EventCategory, count = 4, page = 1): Promise<string[]> {
  const apiKey = process.env.EXPO_PUBLIC_PEXELS_API_KEY;
  if (!apiKey) return [];
  const query = CATEGORY_SEARCH_TERMS[category];

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&page=${page}&orientation=square`,
      { headers: { Authorization: apiKey } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const photos: { src?: { large2x?: string; large?: string; original?: string } }[] = data.photos ?? [];
    return photos.map((p) => p.src?.large2x ?? p.src?.large ?? p.src?.original).filter((url): url is string => Boolean(url));
  } catch {
    return [];
  }
}

const CACHE_KEY = 'puraevents:categoryPhotosCache';
// How many Pexels result pages to rotate through — arbitrary but small
// enough that each page still has `count` distinct results for every
// category's (fairly narrow) search term.
const PAGE_COUNT = 5;

interface CategoryPhotosCache {
  date: string; // local YYYY-MM-DD
  photos: Partial<Record<EventCategory, string[]>>;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Cheap deterministic string hash — same date always picks the same page
// (so every screen/re-open today shows the same set, not a different
// random shuffle each time), but a different one from any other date.
function hashToPage(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return 1 + (hash % PAGE_COUNT);
}

// Fetches all categories' photos once per calendar day and caches the
// result — "random" category photos should feel like a fresh daily pick,
// not reshuffle every single time the Widgets tab happens to mount (which
// would just burn Pexels calls and make the grid visibly jump around on
// every visit within the same day).
export async function getCategoryPhotos(categories: EventCategory[], count = 4): Promise<Partial<Record<EventCategory, string[]>>> {
  const today = todayKey();
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached: CategoryPhotosCache = JSON.parse(raw);
      if (cached.date === today) return cached.photos;
    }
  } catch {
    // Corrupt/unreadable cache — fall through and refetch.
  }

  const page = hashToPage(today);
  const results = await Promise.all(categories.map((c) => fetchCategoryPhotos(c, count, page)));
  const photos: Partial<Record<EventCategory, string[]>> = {};
  categories.forEach((c, i) => {
    photos[c] = results[i];
  });

  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, photos } satisfies CategoryPhotosCache));
  } catch {
    // Best-effort cache — today's freshly fetched photos still return below.
  }
  return photos;
}
