// Design tokens distilled from the approved UI/UX mockups. Keep this file as
// the single source of truth for color/spacing/radius/typography instead of
// hardcoding values in screens.

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

// Caps a scrollable screen's content width and centers it on wide viewports
// (iPad, Android tablets, Mac via "designed for iPad") so a form or list
// designed for a phone doesn't stretch into unreadably wide rows/inputs —
// on a phone-width screen this is a no-op since maxWidth exceeds the
// viewport. Apply via contentContainerStyle: { ...responsiveContent }.
export const maxContentWidth = 640;
export const responsiveContent = { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' } as const;

// Event accent colors (used on hero cards, widgets, chips). Shared across
// light/dark — only the neutrals (background/surface/text/...) flip.
// Softened ~40% toward white from the original, more saturated set (per
// user request — the New Event picker's swatches felt too intense; an
// initial ~18% blend was applied first but wasn't a visible enough change).
export const accents = {
  coral: '#FFA6A6',
  amber: '#FFD079',
  mint: '#7ADCBB',
  violet: '#A39BE8',
} as const;

export type AccentKey = keyof typeof accents;
export const ACCENT_KEYS = Object.keys(accents) as AccentKey[];

// "Color by function" badge colors for Settings/Preferences rows (see UI
// mockup) — each settings row gets a solid-colored square icon badge keyed
// by what the row does, independent of light/dark theme.
export const rowBadgeColors = {
  pink: '#FF6B94',
  blue: '#4C8DFF',
  orange: accents.amber,
  green: accents.mint,
  red: '#E5484D',
  purple: accents.violet,
} as const;

const shared = {
  primary: '#6558D9',
  onPrimary: '#FFFFFF',
  danger: '#E5484D',
  ...accents,
};

export const lightColors = {
  ...shared,
  background: '#F7F7FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F0F4',
  text: '#171821',
  secondary: '#646672',
  outline: '#DDDEE6',
};

export const darkColors = {
  ...shared,
  danger: '#FF6B6B',
  background: '#0E0E14',
  surface: '#1A1B24',
  surfaceAlt: '#22232F',
  text: '#F5F5F7',
  secondary: '#9A9AA6',
  outline: '#2A2B36',
};

export type ColorTokens = typeof lightColors;

export const typography = {
  title: { fontSize: 34, fontWeight: '600' as const },
  headline: { fontSize: 22, fontWeight: '600' as const },
  body: { fontSize: 17, fontWeight: '400' as const },
  bodyStrong: { fontSize: 17, fontWeight: '600' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  numbers: { fontSize: 34, fontWeight: '700' as const, fontVariant: ['tabular-nums'] as const },
};

export const elevation = {
  e0: {},
  e1: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  e2: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
} as const;

// Minimum comfortable tap target from the design system callouts (44pt iOS / 48dp Android).
export const minTapTarget = 44;
