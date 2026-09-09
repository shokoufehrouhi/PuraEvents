// Curated Pexels search terms for the Widgets tab's Pro "category photo"
// gallery (2 photos per category, locked behind Pro) — same Pexels API
// already used for the Events tab's location-photo hero banner (see
// locationPhoto.ts), just keyed by category instead of place name.
import type { EventCategory } from '../types/event';

const CATEGORY_SEARCH_TERMS: Record<EventCategory, string> = {
  personal: 'celebration confetti',
  work: 'office desk workspace',
  travel: 'travel landscape',
  finance: 'finance money',
  health: 'wellness health',
  other: 'abstract pattern',
};

// Returns up to `count` distinct photo URLs for a category, or [] on any
// failure (missing API key, offline, no results) — callers just show
// nothing/a placeholder for that category rather than crashing.
export async function fetchCategoryPhotos(category: EventCategory, count = 2): Promise<string[]> {
  const apiKey = process.env.EXPO_PUBLIC_PEXELS_API_KEY;
  if (!apiKey) return [];
  const query = CATEGORY_SEARCH_TERMS[category];

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=square`,
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
