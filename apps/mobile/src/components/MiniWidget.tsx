import { LinearGradient } from 'expo-linear-gradient';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { useTheme } from '../theme/PreferencesContext';
import { CARD_THEMES } from '../theme/cardThemes';
import { accents } from '../theme/tokens';
import type { PurEvent, WidgetCornerStyle, WidgetTextStyle } from '../types/event';
import { darken } from '../utils/color';
import { resolvePhotoUri } from '../utils/persistImage';
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
  // small home-screen-gallery mockup. 'small' is the real home-screen
  // widget's own fixed size (see androidWidgetTask.tsx / app.json's
  // minWidth/minHeight for CountdownWidgetSmall) — kept in sync with those
  // dp values so this preview always matches what actually lands on the
  // Home Screen; used everywhere a *single* card is previewed (event
  // detail, the wizard's Appearance step, custom-widget.tsx,
  // add-widget-to-home.tsx). 'gridSmall' is for the two wrapping-grid
  // screens only (Widgets tab, widget-picker.tsx) — deliberately narrower
  // than 'small' so two cards actually fit one row on a real phone width;
  // it trades exact real-widget-size accuracy for that, so it's scoped to
  // just those two screens rather than replacing 'small' everywhere.
  size: 'small' | 'gridSmall' | 'full';
}

// A fixed frame per size, not a minimum — same as how a real WidgetKit
// widget renders (content fits or truncates, the box itself never grows).
// 'full' is unrelated to this size class — it's the Preferences/Detail
// screens' own full-width banner.
const DIMS: Record<Props['size'], { width: number | '100%'; height?: number; minHeight?: number }> = {
  small: { width: 175, height: 175 },
  gridSmall: { width: 165, height: 165 },
  full: { width: '100%', minHeight: 140 },
};

// Shared home-screen-widget mockup — used by the Widgets tab (against a
// sample/most-relevant event), the wizard's Appearance step, and the event
// detail screen (live preview of the event's own appearance). Reads the
// same CARD_THEMES preset as EventHeroCard so the preview actually
// reflects the Appearance choice. 'small' is glanceable (icon + title +
// day count only) and matches the real home-screen widget's own compact
// content exactly; 'full' shows the full date+time/countdown/note format
// used everywhere else a "widget" is previewed (Widgets tab, widget
// picker), unrelated to the real widget's own size.
export function MiniWidget({ event, size }: Props) {
  const { t } = useTranslation();
  const { radius } = useTheme();
  // A photo that fails to actually load (deleted local file, dead Pexels
  // URL, offline, ...) falls back to the same accent-color gradient the
  // 'color' preset itself uses below, rather than a broken/blank card.
  // Reset during render (not an effect) when the photo itself changes, so
  // a *new* photo gets its own chance — the "adjusting state while
  // rendering" pattern, see https://react.dev/learn/you-might-not-need-an-effect.
  const [photoFailed, setPhotoFailed] = useState(false);
  const [checkedUri, setCheckedUri] = useState(event.customPhotoUri);
  if (event.customPhotoUri !== checkedUri) {
    setCheckedUri(event.customPhotoUri);
    setPhotoFailed(false);
  }
  const preset = CARD_THEMES[event.cardTheme] ?? CARD_THEMES.color;
  const base = accents[event.accentColor] ?? accents.violet;
  const nextOccurrence = getNextOccurrence(event.dateTimeISO, event.repeat);
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
  const full = size === 'full';
  const iconSize = full ? 28 : 20;
  // 'full' scale — tuned for the wide Widgets-tab/picker cards.
  // small scale — tuned to fit the real home-screen widget's own 175×175dp
  // square (see androidWidgetTask.tsx, which mirrors this exact structure;
  // Android/launchers round minWidth up to a whole grid-cell count
  // regardless of resizeMode, so an earlier narrower 110dp's actual
  // reserved footprint on a real device left no room for a second
  // widget in the same row).
  const s = full
    ? { label: 13, repeat: 12, title: 18, date: 13, number: 26, numberLabel: 10, note: 14 }
    : { label: 12, repeat: 11, title: 16, date: 12, number: 20, numberLabel: 9, note: 14 };

  // Same canonical widget-card format at every size (category+repeat
  // header, title, date+time line, D/H/M countdown, note) — per explicit
  // request that the widget preview show the same fields as the real
  // home-screen widget (see androidWidgetTask.tsx, which mirrors this
  // exact structure at 'small' scale).
  const inner = (
    <>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <EventIcon category={event.category} size={iconSize} />
          <Text style={{ color: textColor, fontSize: s.label, fontWeight: '800', marginLeft: 8 }} numberOfLines={1}>
            {categoryLabel}
          </Text>
        </View>
        <Text style={{ color: secondaryColor, fontSize: s.repeat, fontWeight: '700' }} numberOfLines={1}>
          {t(`events.repeat.${event.repeat}`)}
        </Text>
      </View>

      <View>
        <Text style={{ color: textColor, fontSize: s.title, fontWeight: titleWeight }} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={{ color: secondaryColor, fontSize: s.date, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
          {dayjs(nextOccurrence).format('ddd, MMM D · HH:mm')}
        </Text>
        <HeroCountdown
          targetISO={nextOccurrence.toISOString()}
          textColor={textColor}
          labelColor={secondaryColor}
          numberSize={s.number}
          labelSize={s.numberLabel}
          compact
        />
        {event.note ? (
          <Text style={{ color: secondaryColor, fontSize: s.note, fontWeight: '600', marginTop: full ? 8 : 6 }} numberOfLines={full ? 2 : 1}>
            {event.note}
          </Text>
        ) : null}
      </View>
    </>
  );

  const boxStyle = [dims, { borderRadius: cornerRadius, padding: full ? 14 : 10, justifyContent: 'space-between' as const }];

  // 'custom' with a photo actually set — dark scrim under it for
  // legibility (opacity from customOverlayOpacity, default 35%), same
  // treatment as EventHeroCard's own photo mode. No photo yet falls through
  // to the accent-gradient branch below instead (custom has no fixed
  // `background` either, same as 'color').
  if (event.cardTheme === 'custom' && event.customPhotoUri && !photoFailed) {
    return (
      // Plain View + absolutely-filled Image, not ImageBackground —
      // ImageBackground proxies its outer style's width/height onto the
      // inner Image (see its own source), and 'full' size uses minHeight
      // (no explicit height, see DIMS) isn't reflected there, leaving the
      // image undersized/misaligned (same bug fixed for the Widgets tab's
      // grid cards — see app/(tabs)/widgets.tsx).
      <View style={[boxStyle, { overflow: 'hidden' }]}>
        <Image
          source={{ uri: resolvePhotoUri(event.customPhotoUri) }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setPhotoFailed(true)}
        />
        <View style={{ position: 'absolute', inset: 0, backgroundColor: `rgba(0,0,0,${overlayOpacity})` }} />
        {inner}
      </View>
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
