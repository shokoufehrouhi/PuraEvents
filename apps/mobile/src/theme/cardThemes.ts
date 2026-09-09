import type { CardTheme } from '../types/event';

// Hero card presets — deliberately independent of the app's own light/dark
// scheme (PreferencesContext) and of the event's category color: these are
// a *card* skin the user picks in Appearance. `background` is omitted for
// 'color' since that preset fills with the event's own accentColor instead
// of a fixed color (see EventHeroCard).
export const CARD_THEMES: Record<
  CardTheme,
  {
    background?: string;
    border?: string;
    text: string;
    secondary: string;
    /** How the EventIcon badge should render on this background. */
    iconVariant: 'white' | 'pastel' | 'solid';
  }
> = {
  clean: {
    background: '#FFFFFF',
    border: '#DDDEE6',
    text: '#171821',
    secondary: '#646672',
    iconVariant: 'pastel',
  },
  color: {
    text: '#FFFFFF',
    secondary: 'rgba(255,255,255,0.78)',
    iconVariant: 'white',
  },
  dark: {
    background: '#12121A',
    text: '#FFFFFF',
    secondary: 'rgba(255,255,255,0.7)',
    iconVariant: 'solid',
  },
  // No fixed `background` — the photo itself (customPhotoUri) is the
  // background, with a dark scrim under it for legibility, same treatment
  // as EventHeroCard's own photo mode. Falls back to the 'color' look
  // (below) if customPhotoUri isn't set yet, so this never renders broken.
  custom: {
    text: '#FFFFFF',
    secondary: 'rgba(255,255,255,0.85)',
    iconVariant: 'white',
  },
};

// Free-tier presets shown as plain color swatches in Appearance — 'custom'
// gets its own dedicated UI (photo picker) instead of a swatch, so it's
// deliberately excluded from this list (and from its type, so callers don't
// need an unreachable 'custom' branch when switching over these keys).
export const CARD_THEME_KEYS: Exclude<CardTheme, 'custom'>[] = ['clean', 'color', 'dark'];
