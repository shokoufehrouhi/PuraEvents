import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import dayjs from 'dayjs';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { MiniWidget } from '../src/components/MiniWidget';
import { Row } from '../src/components/ui/Row';
import { Section } from '../src/components/ui/Section';
import { Button } from '../src/components/ui/Button';
import { listEvents, updateEvent } from '../src/storage/events';
import { FREE_LIMITS, usePro } from '../src/subscription';
import { useTheme } from '../src/theme/PreferencesContext';
import { accents, type AccentKey } from '../src/theme/tokens';
import type { PurEvent, WidgetCornerStyle, WidgetTextStyle } from '../src/types/event';
import { awaitPick, resolvePick } from '../src/utils/pickerBridge';
import { persistPickedImage } from '../src/utils/persistImage';

type PreviewSize = 'small' | 'medium' | 'large';

// Fixed placeholder content for the preview — this screen is a design
// canvas for a widget's look (photo/overlay/corners/text), not a live
// editor of one specific event's real title/date/note, so it never shows a
// real event's data here even when one is loaded (see the useEffect below,
// which only pulls a real event's already-saved *style* fields).
const DEFAULT_SAMPLE: PurEvent = {
  id: 'sample',
  title: 'New York',
  dateTimeISO: dayjs().add(15, 'day').toISOString(),
  timezone: 'America/New_York',
  category: 'travel',
  accentColor: 'coral',
  cardTheme: 'custom',
  note: "Don't forget your passport",
  repeat: 'none',
  reminders: [],
  createdAt: '',
  updatedAt: '',
};

// Full custom-widget editor (see the Widgets tab's "Customize Widget"
// button) — photo/overlay/accent/corner/text rows per the supplied
// mockup, every row now backed by a real field on the event and pushing
// its own picker screen (same "opens like Language" pattern as
// Preferences' own Theme/Calendar/etc rows).
export default function CustomWidgetScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  // eventId: set when opened from a specific saved widget's swatch, or from
  // the New/Edit Event wizard editing an event that already exists in
  // storage — edit/exclude that exact one instead of auto-picking below.
  // draft: set when opened from the New/Edit Event wizard — Save resolves
  // the picked settings back to the wizard (see pickerBridge) instead of
  // writing straight into storage, since there's no saved event to write
  // into yet (or the wizard's own Save hasn't run, for edit mode).
  // init*: the wizard's own current draft values, so re-opening this screen
  // to tweak an already-picked photo doesn't lose it.
  const { eventId, draft, initPhotoUri, initWidgetName, initOverlay, initCorner, initText, initAccentColor } =
    useLocalSearchParams<{
      eventId?: string;
      draft?: string;
      initPhotoUri?: string;
      initWidgetName?: string;
      initOverlay?: string;
      initCorner?: string;
      initText?: string;
      initAccentColor?: string;
    }>();
  const isDraft = draft === '1';
  const { colors, spacing, radius, typography } = useTheme();
  const { isPro } = usePro();
  // Draft mode seeds straight from the wizard's own current draft values
  // (via a lazy initializer, not a setState-in-effect — these route params
  // are fixed for this screen's lifetime) instead of looking anything up
  // in storage; non-draft starts from the fixed placeholder and gets
  // filled in once the target lookup below resolves.
  const [sample, setSample] = useState<PurEvent>(() =>
    isDraft
      ? {
          ...DEFAULT_SAMPLE,
          customPhotoUri: initPhotoUri || undefined,
          accentColor: (initAccentColor as AccentKey) || DEFAULT_SAMPLE.accentColor,
          customOverlayOpacity: initOverlay ? Number(initOverlay) : undefined,
          customCornerStyle: (initCorner as WidgetCornerStyle) || undefined,
          customTextStyle: (initText as WidgetTextStyle) || undefined,
        }
      : DEFAULT_SAMPLE
  );
  // The real event these style fields get saved into on Save — null until
  // the fetch below resolves, forever if the user has no events yet, or
  // always in draft mode (Save resolves back to the wizard instead).
  // Kept separate from `sample` because `sample` never carries a real
  // event's own id/title/date/note (see DEFAULT_SAMPLE above).
  const [targetEventId, setTargetEventId] = useState<string | null>(null);
  // Every *other* event that already has a custom-photo widget — the
  // free-tier quota (see FREE_LIMITS) counts these regardless of whether
  // each one's cardTheme is *currently* pointed at 'custom' or something
  // else (Free Styles lets you switch away without losing the saved photo).
  const [otherUsedCount, setOtherUsedCount] = useState(0);
  const [previewSize, setPreviewSize] = useState<PreviewSize>('medium');
  const [widgetName, setWidgetName] = useState(() => (isDraft ? initWidgetName ?? '' : ''));

  // Mount-only, not useFocusEffect — the photo picker (pickPhoto below)
  // presents a native modal that can re-trigger this screen's focus
  // lifecycle when it dismisses; refetching there would overwrite the
  // just-picked photo with the still-unsaved event from storage before the
  // user ever sees it, which is exactly the "preview doesn't update" bug.
  useEffect(() => {
    listEvents().then((events) => {
      setOtherUsedCount(events.filter((e) => e.customPhotoUri && e.id !== eventId).length);
      if (isDraft) return;
      // An explicit eventId (tapped a specific saved widget's swatch) wins
      // outright. Otherwise prefer any event that already has a custom
      // photo (so re-opening this screen from "+ Custom" keeps editing the
      // same one, regardless of its *currently active* cardTheme) and only
      // fall back to any upcoming/repeating event as a save target when
      // there isn't one yet.
      const target = eventId
        ? events.find((e) => e.id === eventId)
        : events.find((e) => e.customPhotoUri) ?? events.find((e) => e.repeat !== 'none' || dayjs(e.dateTimeISO).isAfter(dayjs()));
      if (target) {
        setTargetEventId(target.id);
        setWidgetName(target.customWidgetName ?? '');
        // Only the already-saved *style* fields carry over — title/date/
        // category/note stay DEFAULT_SAMPLE's fixed placeholder, per above.
        setSample((s) => ({
          ...s,
          customPhotoUri: target.customPhotoUri,
          accentColor: target.accentColor,
          customOverlayOpacity: target.customOverlayOpacity,
          customCornerStyle: target.customCornerStyle,
          customTextStyle: target.customTextStyle,
        }));
      }
    });
  }, [eventId, isDraft]);

  const slotsUsed = Math.min(otherUsedCount + (sample.customPhotoUri ? 1 : 0), FREE_LIMITS.maxWidgets);
  const quotaFull = !isPro && otherUsedCount >= FREE_LIMITS.maxWidgets;

  async function pickPhoto() {
    if (quotaFull) {
      router.push('/paywall');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [4, 3] });
    if (!result.canceled && result.assets[0]) {
      // Copy out of ImagePicker's own (OS-purgeable) cache location into
      // permanent storage — otherwise a later rebuild/reinstall silently
      // turns this into a broken image (see persistImage.ts).
      const persistedUri = await persistPickedImage(result.assets[0].uri);
      setSample((s) => ({ ...s, cardTheme: 'custom', customPhotoUri: persistedUri }));
    }
  }

  async function pickSize() {
    router.push({ pathname: '/widget-size-picker', params: { current: previewSize } });
    const picked = await awaitPick();
    setPreviewSize(picked as PreviewSize);
  }

  async function pickOverlay() {
    router.push({ pathname: '/widget-overlay-picker', params: { current: String(sample.customOverlayOpacity ?? 35) } });
    const picked = await awaitPick();
    setSample((s) => ({ ...s, customOverlayOpacity: Number(picked) }));
  }

  async function pickAccentColor() {
    router.push({ pathname: '/widget-accent-picker', params: { current: sample.accentColor } });
    const picked = await awaitPick();
    setSample((s) => ({ ...s, accentColor: picked as AccentKey }));
  }

  async function pickCornerStyle() {
    router.push({ pathname: '/widget-corner-picker', params: { current: sample.customCornerStyle ?? 'rounded' } });
    const picked = await awaitPick();
    setSample((s) => ({ ...s, customCornerStyle: picked as WidgetCornerStyle }));
  }

  async function pickTextStyle() {
    router.push({ pathname: '/widget-text-style-picker', params: { current: sample.customTextStyle ?? 'system' } });
    const picked = await awaitPick();
    setSample((s) => ({ ...s, customTextStyle: picked as WidgetTextStyle }));
  }

  async function handleSave() {
    if (isDraft) {
      // Hand the picked settings back to the wizard instead of writing to
      // storage — it applies them to its own draft state and only
      // persists once the event itself is actually saved.
      resolvePick(
        JSON.stringify({
          photoUri: sample.customPhotoUri,
          widgetName: widgetName.trim(),
          overlay: sample.customOverlayOpacity,
          corner: sample.customCornerStyle,
          text: sample.customTextStyle,
          accentColor: sample.accentColor,
        })
      );
    } else if (targetEventId) {
      await updateEvent(targetEventId, {
        cardTheme: sample.cardTheme,
        customPhotoUri: sample.customPhotoUri,
        customWidgetName: widgetName.trim() || undefined,
        accentColor: sample.accentColor,
        customOverlayOpacity: sample.customOverlayOpacity,
        customCornerStyle: sample.customCornerStyle,
        customTextStyle: sample.customTextStyle,
      });
    }
    router.back();
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <View style={[styles.nameCard, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md }]}>
        <Text style={[typography.label, { color: colors.secondary, marginBottom: 8 }]}>{t('widgets.widgetName')}</Text>
        <TextInput
          style={[styles.nameInput, { borderColor: colors.outline, color: colors.text, borderRadius: radius.md }]}
          value={widgetName}
          onChangeText={setWidgetName}
          placeholder={t('widgets.widgetNamePlaceholder')}
          placeholderTextColor={colors.secondary}
        />
      </View>

      <View style={[styles.quotaCard, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }]}>
        <View style={styles.quotaHeader}>
          <View style={styles.quotaHeaderLeft}>
            <Ionicons name="image-outline" size={18} color={colors.primary} />
            <Text style={[typography.bodyStrong, { color: colors.text, marginLeft: 8 }]}>{t('widgets.freeCustomWidget')}</Text>
          </View>
          {!isPro ? (
            <Text style={[typography.caption, { color: colors.primary }]} onPress={() => router.push('/upgrade')}>
              {t('widgets.getPro')}
            </Text>
          ) : null}
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt, borderRadius: 999, marginTop: spacing.sm }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${(slotsUsed / FREE_LIMITS.maxWidgets) * 100}%`, backgroundColor: colors.primary, borderRadius: 999 },
            ]}
          />
        </View>
        <Text style={[typography.caption, { color: colors.secondary, marginTop: 4 }]}>
          {slotsUsed}/{FREE_LIMITS.maxWidgets}
        </Text>
      </View>

      <View style={{ alignItems: 'center', marginVertical: spacing.lg }}>
        <MiniWidget event={sample} size={previewSize} />
      </View>

      <Section>
        <Row icon="resize-outline" label={t('widgets.widgetSize')} value={t(`widgets.${previewSize}`)} onPress={pickSize} />
        <Row icon="image-outline" label={t('widgets.choosePhoto')} onPress={pickPhoto} />
        <Row icon="contrast-outline" label={t('widgets.overlay')} value={`${sample.customOverlayOpacity ?? 35}%`} onPress={pickOverlay} />
        <Row
          icon="color-palette-outline"
          label={t('widgets.accentColor')}
          value={sample.accentColor}
          badgeColor={accents[sample.accentColor]}
          onPress={pickAccentColor}
        />
        <Row
          icon="square-outline"
          label={t('widgets.cornerStyle')}
          value={t(`widgets.${sample.customCornerStyle ?? 'rounded'}`)}
          onPress={pickCornerStyle}
        />
        <Row
          icon="text-outline"
          label={t('widgets.textStyle')}
          value={t(`widgets.${sample.customTextStyle ?? 'system'}`)}
          onPress={pickTextStyle}
        />
      </Section>

      <Button
        label={t('widgets.saveCustomWidget')}
        onPress={handleSave}
        disabled={!sample.customPhotoUri}
        style={{ marginTop: spacing.lg }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  nameCard: {},
  nameInput: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  quotaCard: {},
  quotaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quotaHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  progressTrack: { height: 6, overflow: 'hidden' },
  progressFill: { height: 6 },
});
