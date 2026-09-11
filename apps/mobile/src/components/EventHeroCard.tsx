import { useTranslation } from 'react-i18next';
import { ImageBackground, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { usePreferences } from '../theme/PreferencesContext';
import { CARD_THEMES } from '../theme/cardThemes';
import { accents } from '../theme/tokens';
import type { PurEvent, WidgetCornerStyle, WidgetTextStyle } from '../types/event';
import { formatEventDateLine, formatTodayLine } from '../utils/eventDate';
import { resolvePhotoUri } from '../utils/persistImage';
import { getNextOccurrenceISO } from '../utils/recurrence';
import { EventIcon } from './EventIcon';
import { HeroCountdown } from './HeroCountdown';

// Same presets MiniWidget uses for a 'custom' widget's own Overlay/Corner
// Style/Text Style controls (see app/custom-widget.tsx) — applied here too
// so the format matches exactly when this card is showing that same photo,
// per explicit request that every widget card share one format.
const CORNER_RADIUS: Record<WidgetCornerStyle, number> = { sharp: 0, rounded: 16, extraRounded: 28 };
// Spread wide on purpose — 700/800/900 (and even 600/700/900) sit close
// enough together that adjacent steps were visually indistinguishable at
// title size, which is the whole point of this control. Standard
// regular/bold/black weights (400/700/900) instead, so every step is a
// clearly different look, not just 'black' vs the other two.
const TITLE_WEIGHT: Record<WidgetTextStyle, TextStyle['fontWeight']> = { system: '400', bold: '700', black: '900' };

// Local, always-available background for the generic "Today" banner when
// there's no real event to theme it and the Pexels photo couldn't be
// fetched (offline, or the API is blocked/filtered in some countries) — an
// on-brand violet skyline illustration rather than a flat color, so the
// banner never looks broken or empty.
const FALLBACK_HERO_IMAGE = require('../../assets/images/hero-fallback.png');

interface Props {
  // Optional so the top-of-Events-tab banner can render even with zero
  // events (falls back to a generic "Today" caption/date, no
  // title/category/countdown — see the no-event branch below).
  event?: PurEvent;
  height?: number;
  // A fetched photo of the user's own current city/country, shown with a
  // dark scrim for text legibility. The generic "Today" banner (no `event`)
  // always gets photo-style treatment regardless of this prop, falling
  // back to FALLBACK_HERO_IMAGE when unset/fetch failed. An `event` card
  // stays flat-themed unless `showPhoto` is also set — leave both unset for
  // the normal flat-CARD_THEMES look (event detail, wizard preview, etc.).
  photoUri?: string;
  // Forces the same photo treatment as the generic banner onto an `event`
  // card too (falling back to FALLBACK_HERO_IMAGE if `photoUri` didn't
  // resolve) — for spots that want an event-styled card to always have a
  // photo background regardless of fetch success, e.g. the Preferences
  // screen's live preview.
  showPhoto?: boolean;
  // Shrinks just the D/H/M countdown's own text — for a compact card (e.g.
  // Preferences' Preview) without affecting every other hero card that
  // shares HeroCountdown's default size.
  countdownNumberSize?: number;
  countdownLabelSize?: number;
  // Same idea for the event title, which otherwise always uses the fixed
  // 34px hero-card size below — a compact preview card needs it smaller too.
  titleSize?: number;
}

// Hero card for an event — one of three flat presets (Clean/Color/Dark, see
// src/theme/cardThemes.ts and the Appearance step of the wizard). 'color'
// fills with the event's own accentColor; 'dark'/'clean' are fixed colors
// independent of accent/category; 'custom' uses the event's own
// customPhotoUri (a user-picked photo, free: 1 event/Pro: unlimited, or a
// Pro category-gallery pick — see the Widgets tab).
export function EventHeroCard({ event, height = 170, photoUri, showPhoto, countdownNumberSize, countdownLabelSize, titleSize }: Props) {
  const { t, i18n } = useTranslation();
  const { radius, spacing, prefs } = usePreferences();
  const preset = event ? CARD_THEMES[event.cardTheme] ?? CARD_THEMES.color : CARD_THEMES.color;
  const background = preset.background ?? accents[event?.accentColor ?? 'violet'] ?? accents.violet;
  const nextOccurrenceISO = event ? getNextOccurrenceISO(event.dateTimeISO, event.repeat) : null;
  const customPhoto = event?.cardTheme === 'custom' ? event.customPhotoUri : undefined;
  // Only a genuine 'custom' event with its own photo gets its own Overlay/
  // Corner Style/Text Style settings — the generic banner and other
  // photoUri-forced spots (e.g. Preferences' preview) keep the fixed
  // design-system look.
  const isCustomPhotoCard = Boolean(customPhoto);
  const cornerRadius = isCustomPhotoCard ? CORNER_RADIUS[event!.customCornerStyle ?? 'rounded'] : radius.lg;
  const titleWeight: TextStyle['fontWeight'] = isCustomPhotoCard ? TITLE_WEIGHT[event!.customTextStyle ?? 'system'] : '900';
  const scrimOpacity = isCustomPhotoCard ? (event!.customOverlayOpacity ?? 35) / 100 : 0.32;

  // The generic "Today" banner always gets the photo treatment (real photo
  // or the local fallback image below) — a photo's own brightness varies,
  // so force legible white-on-scrim text instead of trusting whatever the
  // event's own theme picked. An event card gets the same treatment when a
  // caller explicitly passes photoUri (e.g. the Preferences screen's live
  // preview) or when the event's own cardTheme is 'custom' with a photo
  // set — event cards without either keep their flat CARD_THEMES look.
  const isGenericBanner = !event;
  const hasPhoto = isGenericBanner || Boolean(photoUri) || Boolean(showPhoto) || Boolean(customPhoto);
  const textColor = hasPhoto ? '#FFFFFF' : preset.text;
  const secondaryColor = hasPhoto ? 'rgba(255,255,255,0.85)' : preset.secondary;

  // "Today Trips" is about this being the generic no-event banner, not
  // about whether the photo happened to load — keep it (and the rest of
  // the layout) exactly the same on the fallback background so a
  // failed/slow photo fetch doesn't change the card's format, only its
  // background image.
  const caption = isGenericBanner ? (
    <Text style={styles.heroCaption} numberOfLines={1}>
      {t('events.heroCaption')}
    </Text>
  ) : null;

  const content =
    event && nextOccurrenceISO ? (
      <>
        {caption}
        <View style={styles.metaRow}>
          <View style={styles.categoryRow}>
            <EventIcon category={event.category} size={22} />
            <Text style={[styles.categoryText, { color: textColor }]} numberOfLines={1}>
              {t(`events.category.${event.category}`)}
            </Text>
          </View>
          <Text style={[styles.repeatText, { color: secondaryColor }]} numberOfLines={1}>
            {t(`events.repeat.${event.repeat}`)}
          </Text>
        </View>

        <View style={styles.bottom}>
          <Text
            style={[styles.title, { color: textColor, fontWeight: titleWeight }, titleSize ? { fontSize: titleSize } : null]}
            numberOfLines={1}
          >
            {event.title}
          </Text>
          <Text style={[styles.dateLine, { color: secondaryColor }]} numberOfLines={1}>
            {formatEventDateLine(nextOccurrenceISO, event.repeat, prefs.calendar, i18n.language)}
          </Text>
          <HeroCountdown
            targetISO={nextOccurrenceISO}
            textColor={textColor}
            labelColor={secondaryColor}
            numberSize={countdownNumberSize}
            labelSize={countdownLabelSize}
          />
          {event.note ? (
            <Text style={[styles.note, { color: secondaryColor }]} numberOfLines={2}>
              {event.note}
            </Text>
          ) : null}
        </View>
      </>
    ) : (
      // No events yet — still show the "Today" banner (photo/caption/real
      // current date+weekday+time), just without a title/countdown since
      // there's no event to count down to.
      <>
        {caption}
        <View style={styles.bottom}>
          <Text
            style={[styles.title, { color: textColor, fontWeight: titleWeight }, titleSize ? { fontSize: titleSize } : null]}
            numberOfLines={1}
          >
            {t('events.todayTitle')}
          </Text>
          <Text style={[styles.dateLine, { color: secondaryColor }]} numberOfLines={1}>
            {formatTodayLine(prefs.calendar, i18n.language)}
          </Text>
        </View>
      </>
    );

  if (hasPhoto) {
    return (
      <ImageBackground
        source={photoUri ? { uri: resolvePhotoUri(photoUri) } : customPhoto ? { uri: resolvePhotoUri(customPhoto) } : FALLBACK_HERO_IMAGE}
        style={[styles.card, { borderRadius: cornerRadius, minHeight: height }]}
        imageStyle={{ borderRadius: cornerRadius }}
        resizeMode="cover"
      >
        <View style={[styles.photoScrim, { backgroundColor: `rgba(0,0,0,${scrimOpacity})`, borderRadius: cornerRadius, padding: spacing.md }]}>
          {content}
        </View>
      </ImageBackground>
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: background,
          borderColor: preset.border,
          borderWidth: preset.border ? 1 : 0,
          borderRadius: radius.lg,
          minHeight: height,
          padding: spacing.md,
        },
      ]}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { justifyContent: 'space-between', overflow: 'hidden' },
  photoScrim: { flex: 1, justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.32)' },
  heroCaption: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  categoryText: { fontSize: 16, fontWeight: '800' },
  repeatText: { fontSize: 15, fontWeight: '700' },
  bottom: { gap: 8, marginTop: 12 },
  // 34 matches the mockup's own design-system "Semibold Title" token
  // (see gpt1.png's typography panel: 34/34 iOS/Android) — weight bumped
  // to '900' (heaviest system weight) per explicit request for a
  // thicker/chunkier look, using the system font rather than a new
  // font family.
  title: { fontSize: 34, fontWeight: '900' },
  dateLine: { fontSize: 21, fontWeight: '800', marginBottom: 2 },
  note: { fontSize: 14, fontWeight: '600', marginTop: 6 },
});
