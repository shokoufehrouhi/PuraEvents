// Curated Pexels photos for the Pro "Categories" widget gallery — same
// Pexels API already used for the Events tab's location-photo hero banner
// (see locationPhoto.ts). The Widgets tab's groups and their search terms
// live in widgets/photoGroups.ts.
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

// Returns up to `count` distinct photo URLs for a search, or [] on any
// failure (missing API key, offline, no results) — callers just show
// nothing/a placeholder for it rather than crashing. `page` picks which
// page of Pexels results to pull, so the same query can return a
// different set on a different day (see photoGroups.ts).
export async function fetchPhotos(query: string, count = 4, page = 1): Promise<string[]> {
  const apiKey = process.env.EXPO_PUBLIC_PEXELS_API_KEY;
  if (!apiKey) return [];

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

export function fetchCategoryPhotos(category: EventCategory, count = 4, page = 1): Promise<string[]> {
  return fetchPhotos(CATEGORY_SEARCH_TERMS[category], count, page);
}
