import { LinearGradient } from 'expo-linear-gradient';
import dayjs from 'dayjs';
import { Text, View } from 'react-native';

import { useTheme } from '../theme/PreferencesContext';
import { CARD_THEMES } from '../theme/cardThemes';
import { accents } from '../theme/tokens';
import type { PurEvent } from '../types/event';
import { darken } from '../utils/color';
import { getNextOccurrence } from '../utils/recurrence';

interface Props {
  event: PurEvent;
  // 'full' spans the container's width at the same height as the
  // Preferences screen's own live preview (EventHeroCard height={140}) —
  // used wherever the widget preview should read as "full-size", not a
  // small home-screen-gallery mockup.
  size: 'small' | 'medium' | 'large' | 'full';
}

// Shared small home-screen-widget mockup — used by the Widgets tab (against
// a sample/most-relevant event) and by the wizard's Appearance step (live
// preview of the event currently being created/edited). Reads the same
// CARD_THEMES preset as EventHeroCard so the widget preview actually
// reflects the Appearance choice (clean/color/dark) instead of always
// rendering the accent-color gradient regardless of cardTheme.
export function MiniWidget({ event, size }: Props) {
  const { radius } = useTheme();
  const preset = CARD_THEMES[event.cardTheme] ?? CARD_THEMES.color;
  const base = accents[event.accentColor] ?? accents.violet;
  const nextOccurrence = getNextOccurrence(event.dateTimeISO, event.repeat);
  const days = Math.max(0, Math.ceil(nextOccurrence.diff(dayjs(), 'hour') / 24));
  const dims =
    size === 'small'
      ? { width: 84, height: 84 }
      : size === 'medium'
        ? { width: 170, height: 84 }
        : size === 'large'
          ? { width: 170, height: 170 }
          : { width: '100%' as const, height: 140 };
  const labelColor = event.cardTheme === 'clean' ? preset.secondary : 'rgba(255,255,255,0.8)';

  const inner = (
    <>
      <Text style={{ color: preset.text, fontSize: size === 'full' ? 16 : 11, fontWeight: '600' }} numberOfLines={1}>
        {event.title}
      </Text>
      <Text style={{ color: preset.text, fontSize: size === 'small' ? 20 : size === 'full' ? 40 : 26, fontWeight: '700' }}>{days}</Text>
      <Text style={{ color: labelColor, fontSize: size === 'full' ? 13 : 10 }}>DAYS</Text>
    </>
  );

  const boxStyle = [dims, { borderRadius: radius.md, padding: size === 'full' ? 16 : 10, justifyContent: 'space-between' as const }];

  // 'color' is the only preset without a fixed background — it fills with
  // the event's own accentColor gradient instead (see cardThemes.ts).
  // 'clean'/'dark' are flat CARD_THEMES colors, matching EventHeroCard.
  if (!preset.background) {
    return (
      <LinearGradient colors={[base, darken(base, 0.35)]} style={boxStyle}>
        {inner}
      </LinearGradient>
    );
  }

  return (
    <View style={[boxStyle, { backgroundColor: preset.background, borderColor: preset.border, borderWidth: preset.border ? 1 : 0 }]}>
      {inner}
    </View>
  );
}
