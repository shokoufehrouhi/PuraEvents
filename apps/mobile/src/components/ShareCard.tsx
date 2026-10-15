import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, Text, View } from 'react-native';

import { usePreferences } from '../theme/PreferencesContext';
import { CARD_THEMES } from '../theme/cardThemes';
import { accents } from '../theme/tokens';
import { SHARE_MESSAGE_MAX_LENGTH, type PurEvent } from '../types/event';
import { formatCivilDateFull } from '../utils/calendars';
import { darken } from '../utils/color';
import { resolvePhotoUri } from '../utils/persistImage';
import { getNextOccurrence } from '../utils/recurrence';

// ID-1 (ISO/IEC 7810) — the standard physical size for a gift/credit card,
// 85.60 × 53.98mm, ratio ≈ 1.586:1. Landscape, fixed (not one of MiniWidget's
// small/medium/large/full — this is a distinct shareable graphic, not a
// home-screen widget mockup), rendered at a size generous enough that
// react-native-view-shot's default (device-native-resolution) capture comes
// out sharp on any screen.
const CARD_WIDTH = 360;
const CARD_HEIGHT = Math.round(CARD_WIDTH / 1.586); // 227

interface Props {
  event: PurEvent;
}

// The Share button's actual capture target (see event/[id]/index.tsx) — a
// standalone "gift card"-shaped graphic combining the event's own widget
// look (photo/theme/accent, same presets MiniWidget/EventHeroCard use) with
// its optional shareMessage (falls back to an auto title+date line when the
// event never set one, so every event is shareable, not just ones that
// bothered to write a message).
export function ShareCard({ event }: Props) {
  const { t, i18n } = useTranslation();
  const { prefs } = usePreferences();
  const preset = CARD_THEMES[event.cardTheme] ?? CARD_THEMES.color;
  const base = accents[event.accentColor] ?? accents.violet;
  const nextOccurrence = getNextOccurrence(event.dateTimeISO, event.repeat);
  const dateLabel = formatCivilDateFull(nextOccurrence.toISOString(), prefs.calendar, i18n.language);
  const overlayOpacity = (event.customOverlayOpacity ?? 35) / 100;
  const hasPhoto = event.cardTheme === 'custom' && Boolean(event.customPhotoUri);
  const textColor = hasPhoto || !preset.background ? '#FFFFFF' : preset.text;
  const secondaryColor = hasPhoto || !preset.background ? 'rgba(255,255,255,0.85)' : preset.secondary;
  const message =
    event.shareMessage?.trim() ||
    t('events.shareDefaultMessage', { title: event.title, date: dateLabel }).slice(0, SHARE_MESSAGE_MAX_LENGTH);

  const background = hasPhoto ? (
    <Image
      source={{ uri: resolvePhotoUri(event.customPhotoUri) }}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
    />
  ) : !preset.background ? (
    <LinearGradient colors={[base, darken(base, 0.35)]} style={StyleSheet.absoluteFill} />
  ) : (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: preset.background }]} />
  );

  return (
    <View style={styles.card}>
      {background}
      {hasPhoto ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${overlayOpacity})` }]} /> : null}

      <View style={styles.top}>
        <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={[styles.date, { color: secondaryColor }]} numberOfLines={1}>
          {dateLabel}
        </Text>
        <View style={styles.messageBox}>
          <Text style={[styles.message, { color: textColor }]} numberOfLines={4}>
            {message}
          </Text>
          {/* One line below the message, right-aligned — not pinned to the
              card's bottom edge next to the wordmark. */}
          {event.sender?.trim() ? (
            <Text style={[styles.sender, { color: secondaryColor }]} numberOfLines={1}>
              {event.sender.trim()}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Same wordmark posture as a real gift card's own corner branding —
          subtle, bottom-left: the app icon, then the name. */}
      <View style={styles.brandRow}>
        <Image source={require('../../assets/images/app-logo.png')} style={styles.brandLogo} />
        <Text style={[styles.brand, { color: secondaryColor }]}>PuraEvents</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
    padding: 18,
    justifyContent: 'space-between',
  },
  top: {},
  title: { fontSize: 22, fontWeight: '800' },
  date: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  // ~1 blank line below the date before the message starts.
  messageBox: { marginTop: 16 },
  message: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  sender: { fontSize: 11, fontWeight: '700', marginTop: 4, textAlign: 'right' },
  brandRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4 },
  brandLogo: { width: 14, height: 14 },
  brand: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, opacity: 0.8 },
});
