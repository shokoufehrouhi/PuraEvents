import { LinearGradient } from 'expo-linear-gradient';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { ImageBackground, Text, View, type TextStyle } from 'react-native';

import { useTheme } from '../theme/PreferencesContext';
import { CARD_THEMES } from '../theme/cardThemes';
import { accents } from '../theme/tokens';
import type { PurEvent, WidgetCornerStyle, WidgetTextStyle } from '../types/event';
import { darken } from '../utils/color';
import { getNextOccurrence } from '../utils/recurrence';
import { EventIcon } from './EventIcon';
import { HeroCountdown } from './HeroCountdown';

// Corner-radius/title-weight presets for a 'custom' widget's own Overlay/
// Corner Style/Text Style controls (see app/custom-widget.tsx) — only
// applied when cardTheme === 'custom', so the flat Clean/Color/Dark
// presets keep their fixed design-system look untouched.
const CORNER_RADIUS: Record<WidgetCornerStyle, number> = { sharp: 0, rounded: 16, extraRounded: 28 };
// Spread wide on purpose — 700/800/900 (and even 600/700/900) sit close
// enough together that adjacent steps were visually indistinguishable at
// title size, which is the whole point of this control. Standard
// regular/bold/black weights (400/700/900) instead, so every step is a
// clearly different look, not just 'black' vs the other two.
const TITLE_WEIGHT: Record<WidgetTextStyle, TextStyle['fontWeight']> = { system: '400', bold: '700', black: '900' };

interface Props {
  event: PurEvent;
  // 'full' spans the container's width at the same height as the
  // Preferences screen's own live preview (EventHeroCard height={140}) —
  // used wherever the widget preview should read as "full-size", not a
  // small home-screen-gallery mockup.
  size: 'small' | 'medium' | 'large' | 'full';
}

// A fixed frame per size, not a minimum — same as how a real WidgetKit
// widget renders (content fits or truncates, the box itself never grows).
// 'large' matches iOS's own systemMedium width (338pt) so it lines up with
// a real home-screen widget; 'small'/'medium' step down from there.
// 'full' is unrelated to this size class — it's the Preferences/Detail
// screens' own full-width banner.
const DIMS: Record<Props['size'], { width: number | '100%'; height?: number; minHeight?: number }> = {
  small: { width: 100, height: 100 },
  medium: { width: 220, height: 130 },
  large: { width: 338, height: 158 },
  full: { width: '100%', minHeight: 140 },
};

// Shared home-screen-widget mockup — used by the Widgets tab (against a
// sample/most-relevant event), the wizard's Appearance step, and the event
// detail screen (live preview of the event's own appearance). Reads the
// same CARD_THEMES preset as EventHeroCard so the preview actually
// reflects the Appearance choice. Content scales up per size to match the
// supplied "Same event. Three sizes." reference: small is glanceable (icon
// + title + day count only), medium adds category/date + a compact D/H/M
// countdown, large/full add the full date+time and a reminder/repeat
// footer row.
export function MiniWidget({ event, size }: Props) {
  const { t } = useTranslation();
  const { radius } = useTheme();
  const preset = CARD_THEMES[event.cardTheme] ?? CARD_THEMES.color;
  const base = accents[event.accentColor] ?? accents.violet;
  const nextOccurrence = getNextOccurrence(event.dateTimeISO, event.repeat);
  const days = Math.max(0, Math.ceil(nextOccurrence.diff(dayjs(), 'hour') / 24));
  const dims = DIMS[size];
  const isCustom = event.cardTheme === 'custom';
  const cornerRadius = isCustom ? CORNER_RADIUS[event.customCornerStyle ?? 'rounded'] : radius.md;
  const titleWeight = isCustom ? TITLE_WEIGHT[event.customTextStyle ?? 'system'] : ('800' as const);
  const overlayOpacity = (event.customOverlayOpacity ?? 35) / 100;
  const textColor = preset.text;
  // 'clean' is the only preset with dark text on a light background — every
  // other preset (color/dark/custom-photo) is white-on-dark, so the
  // secondary/label color follows the same split preset.text already uses.
  const secondaryColor = event.cardTheme === 'clean' ? preset.secondary : 'rgba(255,255,255,0.8)';
  const categoryLabel = t(`events.category.${event.category}`);
  const rich = size === 'medium' || size === 'large' || size === 'full';
  const big = size === 'large' || size === 'full';
  const iconSize = size === 'small' ? 22 : size === 'medium' ? 20 : size === 'large' ? 24 : 28;

  // large/full match the app's one canonical widget-card format exactly
  // (category+repeat header, title, date+time line, D/H/M countdown, note)
  // — same field set/order as EventHeroCard, per explicit request that
  // every widget card show identical data everywhere. medium/small stay
  // condensed (no room for all of that at their size), matching the
  // originally-approved "Same event. Three sizes." reference instead.
  const inner = big ? (
    <>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <EventIcon category={event.category} size={iconSize} />
          <Text style={{ color: textColor, fontSize: 13, fontWeight: '800', marginLeft: 8 }} numberOfLines={1}>
            {categoryLabel}
          </Text>
        </View>
        <Text style={{ color: secondaryColor, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
          {t(`events.repeat.${event.repeat}`)}
        </Text>
      </View>

      <View>
        <Text style={{ color: textColor, fontSize: 18, fontWeight: titleWeight }} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={{ color: secondaryColor, fontSize: 13, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
          {dayjs(nextOccurrence).format('ddd, MMM D · HH:mm')}
        </Text>
        <HeroCountdown
          targetISO={nextOccurrence.toISOString()}
          textColor={textColor}
          labelColor={secondaryColor}
          numberSize={26}
          labelSize={10}
          compact
        />
        {event.note ? (
          <Text style={{ color: secondaryColor, fontSize: 12, fontWeight: '600', marginTop: 8 }} numberOfLines={2}>
            {event.note}
          </Text>
        ) : null}
      </View>
    </>
  ) : rich ? (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <EventIcon category={event.category} size={iconSize} />
        <Text style={{ color: textColor, fontSize: 9, fontWeight: '800', flex: 1 }} numberOfLines={1}>
          {categoryLabel}
        </Text>
        <Text style={{ color: secondaryColor, fontSize: 9, fontWeight: '600' }} numberOfLines={1}>
          {dayjs(nextOccurrence).format('MMM D')}
        </Text>
      </View>

      <View>
        <Text style={{ color: textColor, fontSize: 13, fontWeight: titleWeight }} numberOfLines={1}>
          {event.title}
        </Text>
        {/* Medium's own extra room (see DIMS) fits the same date+time
            line 'big' shows, not just the short header-row date above. */}
        <Text style={{ color: secondaryColor, fontSize: 10, fontWeight: '700', marginTop: 1 }} numberOfLines={1}>
          {dayjs(nextOccurrence).format('ddd, MMM D · HH:mm')}
        </Text>
        <HeroCountdown
          targetISO={nextOccurrence.toISOString()}
          textColor={textColor}
          labelColor={secondaryColor}
          numberSize={15}
          labelSize={7}
          compact
        />
        {event.note ? (
          <Text style={{ color: secondaryColor, fontSize: 9, fontWeight: '600', marginTop: 3 }} numberOfLines={1}>
            {event.note}
          </Text>
        ) : null}
      </View>
    </>
  ) : (
    <>
      <EventIcon category={event.category} size={iconSize} />
      <View>
        <Text style={{ color: textColor, fontSize: 11, fontWeight: titleWeight }} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={{ color: textColor, fontSize: 20, fontWeight: '800' }}>{days}</Text>
        <Text style={{ color: secondaryColor, fontSize: 9, fontWeight: '700' }}>DAYS</Text>
      </View>
    </>
  );

  const boxStyle = [dims, { borderRadius: cornerRadius, padding: big ? 14 : size === 'medium' ? 10 : 10, justifyContent: 'space-between' as const }];

  // 'custom' with a photo actually set — dark scrim under it for
  // legibility (opacity from customOverlayOpacity, default 35%), same
  // treatment as EventHeroCard's own photo mode. No photo yet falls through
  // to the accent-gradient branch below instead (custom has no fixed
  // `background` either, same as 'color').
  if (event.cardTheme === 'custom' && event.customPhotoUri) {
    return (
      <ImageBackground source={{ uri: event.customPhotoUri }} style={boxStyle} imageStyle={{ borderRadius: cornerRadius }} resizeMode="cover">
        <View style={{ position: 'absolute', inset: 0, backgroundColor: `rgba(0,0,0,${overlayOpacity})`, borderRadius: cornerRadius }} />
        {inner}
      </ImageBackground>
    );
  }

  // 'color' is the only preset without a fixed background — it fills with
  // the event's own accentColor gradient instead (see cardThemes.ts).
  // 'clean'/'dark' are flat CARD_THEMES colors, matching EventHeroCard.
  if (!preset.background) {
    return (
      <LinearGradient colors={[base, darken(base, 0.35)]} style={boxStyle}>
        {/* Same scrim as the photo branch above, so Overlay is visibly
            adjustable even before a photo is chosen — 'custom' with no
            photo yet falls through to this same gradient the plain
            'color' theme uses, and previously had no way to preview
            Overlay changes at all until a photo was picked. */}
        {isCustom ? (
          <View
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: `rgba(0,0,0,${overlayOpacity})`, borderRadius: cornerRadius }}
          />
        ) : null}
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

const styles = {
  headerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  headerLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, flexShrink: 1 },
};
