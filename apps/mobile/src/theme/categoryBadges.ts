import type { EventCategory } from '../types/event';

// The category-picker screen's row icons — cropped straight from the
// supplied mockup, colored circle + white line-icon baked into one flat
// PNG each (not a transparent glyph over a separately-tinted background).
// Kept in their own assets/icons/category-badges/ folder, separate from
// assets/icons/categories/ (the transparent glyph-only artwork EventIcon
// still uses everywhere else — list rows, event detail, wizard, hero
// card — where a tinted background is drawn per `variant`, see
// EventIcon.tsx and theme/icons.ts). The category-picker screen renders
// these directly instead of going through EventIcon, since its mockup
// wants the flat baked-together look, not the variant-tinted one.
export const CATEGORY_BADGE_IMAGES: Record<EventCategory, number> = {
  personal: require('../../assets/icons/category-badges/personal.png'),
  work: require('../../assets/icons/category-badges/work.png'),
  travel: require('../../assets/icons/category-badges/travel.png'),
  finance: require('../../assets/icons/category-badges/finance.png'),
  health: require('../../assets/icons/category-badges/health.png'),
  other: require('../../assets/icons/category-badges/other.png'),
};
