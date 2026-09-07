import type { EventCategory } from '../types/event';

// Icon identity is tied 1:1 to category (no separate icon picker — see UI
// feedback that having them as independent choices was confusing). Artwork
// cropped straight from the approved category-picker mockup (colored
// circle + white line-icon baked into one flat PNG each), background
// chroma-keyed to transparent around the circle so EventIcon can drop it
// on its own white badge backdrop. Previously this pointed at a rougher,
// glossy/emoji-style crop from an older mockup that looked visibly out of
// place next to the picker screen's own icons once that screen got the
// real artwork — replaced everywhere at once instead of leaving two
// different icon styles in the app (list rows, event detail, wizard, hero
// card, category-picker all share this one map again).
export const CATEGORY_ICONS: Record<EventCategory, { color: string; image: number }> = {
  personal: { color: '#ED6F64', image: require('../../assets/icons/categories/personal.png') },
  work: { color: '#7F6DC0', image: require('../../assets/icons/categories/work.png') },
  travel: { color: '#6494EC', image: require('../../assets/icons/categories/travel.png') },
  finance: { color: '#74BE92', image: require('../../assets/icons/categories/finance.png') },
  health: { color: '#DD6979', image: require('../../assets/icons/categories/health.png') },
  other: { color: '#917ECA', image: require('../../assets/icons/categories/other.png') },
};

export function getCategoryIcon(category: EventCategory) {
  return CATEGORY_ICONS[category] ?? CATEGORY_ICONS.other;
}
