import { Image, View } from 'react-native';

import { getCategoryIcon } from '../theme/icons';
import type { EventCategory } from '../types/event';

interface Props {
  category: EventCategory;
  size?: number;
  /** No longer changes anything — kept so existing call sites (hero card,
   *  wizard preset preview) don't need touching. The category artwork is
   *  now a flat baked-together image (colored circle + white icon), so
   *  there's nothing left to tint per-surface; every badge gets the same
   *  white circular backdrop regardless of theme. */
  variant?: 'white' | 'pastel' | 'solid';
  shape?: 'squircle' | 'circle';
}

// Icon badge for an event: category and icon are the same choice (no
// separate icon picker — see UI feedback) — the category's own artwork
// (cropped from the approved mockup, see theme/icons.ts) on a plain white
// circular backdrop so it reads clearly on any surface (gradient hero
// cards, colored category chips, plain list rows) without needing to be
// recolored per background.
export function EventIcon({ category, size = 52 }: Props) {
  const { image } = getCategoryIcon(category);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: 'rgba(255,255,255,0.92)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Image source={image} style={{ width: size * 0.86, height: size * 0.86 }} resizeMode="contain" />
    </View>
  );
}
