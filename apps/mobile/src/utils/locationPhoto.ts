// Random photo of the user's current city/country for the top hero card's
// background (Events tab, "next event" card only — see EventHeroCard's
// photoUri prop). Location comes from the device's timezone, not GPS, so no
// location permission is ever requested. Photos come from the Pexels API
// (free, no billing account needed — see .env.example for the API key).
// Deliberately NOT cached across app launches — the user wants a new
// random photo every time the app runs, not the same one for a day.

// "Asia/Tehran" -> "Tehran", "America/New_York" -> "New York". Defaults to
// the device's own timezone, but takes an explicit IANA zone too — e.g. the
// Preferences screen's Preview card, which should reflect whatever
// timezone Preferences itself currently resolves to (manual override or
// device), not always literally the device's.
export function getLocalPlaceName(timezone?: string): string {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = tz.split('/');
  const city = parts[parts.length - 1] ?? tz;
  return city.replace(/_/g, ' ');
}

// Returns a fresh random photo URL for the given place (device's current
// place by default) on every call (the caller's useEffect-on-mount already
// limits this to once per app launch/dependency change). Returns null on
// any failure (missing API key, offline, no results) so callers can just
// fall back to the flat CARD_THEMES background.
export async function fetchLocationPhotoUrl(timezone?: string): Promise<string | null> {
  const apiKey = process.env.EXPO_PUBLIC_PEXELS_API_KEY;
  if (!apiKey) return null;
  const place = getLocalPlaceName(timezone);

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(place)}&per_page=15&orientation=landscape`,
      { headers: { Authorization: apiKey } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const photos: { src?: { large2x?: string; large?: string; original?: string } }[] = data.photos ?? [];
    if (photos.length === 0) return null;
    const pick = photos[Math.floor(Math.random() * photos.length)];
    return pick.src?.large2x ?? pick.src?.large ?? pick.src?.original ?? null;
  } catch {
    return null;
  }
}
