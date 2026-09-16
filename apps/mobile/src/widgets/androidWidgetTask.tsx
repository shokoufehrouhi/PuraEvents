import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import {
  FlexWidget,
  ImageWidget,
  OverlapWidget,
  registerWidgetConfigurationScreen,
  registerWidgetTaskHandler,
  requestPinWidget,
  TextWidget,
  type WidgetConfigurationScreen,
  type WidgetTaskHandler,
} from 'react-native-android-widget';

import { CARD_THEMES } from '../theme/cardThemes';
import { getCategoryIcon } from '../theme/icons';
import type { WidgetCornerStyle, WidgetTextStyle } from '../types/event';
import { darken } from '../utils/color';
import {
  clearConfiguredEventId,
  getConfiguredEventId,
  setConfiguredEventId,
  setPendingConfigureEventId,
  takePendingConfigureEventId,
} from './androidWidgetConfig';
import { listUpcomingEventsForWidgets, type WidgetEventSummary } from './widgetEventSummary';
import { preparePhotoDataUri } from './widgetPhoto';

// The single app.json provider declaration (name matches its own
// minWidth/minHeight there, tuned to this exact real on-screen footprint
// — see that file's own comment) — registerWidgetTaskHandler/
// registerWidgetConfigurationScreen below register once and handle it.
export const ANDROID_WIDGET_NAME = 'CountdownWidgetSmall';

// Same presets as MiniWidget's own (see its comment) — kept as separate
// copies rather than importing MiniWidget's file, since that file also
// pulls in regular react-native-web-style components (Image, LinearGradient)
// that don't belong anywhere near a RemoteViews render tree.
const CORNER_RADIUS: Record<WidgetCornerStyle, number> = { sharp: 0, rounded: 16, extraRounded: 28 };
const TITLE_WEIGHT: Record<WidgetTextStyle, '400' | '700' | '900'> = { system: '400', bold: '700', black: '900' };

// Hardcoded English, not i18n — this headless RemoteViews context runs
// outside react-i18next entirely (same reason "No upcoming events"/"DAYS"
// below are plain literals, not t() calls).
const CATEGORY_LABELS: Record<WidgetEventSummary['category'], string> = {
  personal: 'Personal',
  work: 'Work',
  travel: 'Travel',
  finance: 'Finance',
  health: 'Health',
  other: 'Other',
};
const REPEAT_LABELS: Record<WidgetEventSummary['repeat'], string> = {
  none: 'Does not repeat',
  yearly: 'Yearly',
  monthly: 'Monthly',
  weekly: 'Weekly',
};

// Matches react-native-android-widget's own (unexported) ColorProp —
// TextWidget/FlexWidget's color-ish style props only accept these two
// shapes, not a plain `string`, which is what CARD_THEMES.secondary (and
// this file's own literal rgba() fallback) widen to without this.
type WidgetColor = `#${string}` | `rgba(${number}, ${number}, ${number}, ${number})`;

// Static D/H/M snapshot, not a live-ticking HeroCountdown — a home-screen
// widget only re-renders on tap/resize/updatePeriodMillis (app.json), never
// every second, so anything fancier would just show stale numbers between
// updates exactly the same as this does.
function countdownParts(targetISO: string) {
  const diffMs = Math.max(0, dayjs(targetISO).diff(dayjs()));
  return {
    days: Math.floor(diffMs / 86_400_000),
    hours: Math.floor((diffMs % 86_400_000) / 3_600_000),
    minutes: Math.floor((diffMs % 3_600_000) / 60_000),
  };
}

// The actual card — everything below "no upcoming events" in
// CountdownWidget. Mirrors MiniWidget's own small tier and clean/color/
// dark/custom theme branches as closely as RemoteViews primitives allow:
// no live countdown (see countdownParts above), no LinearGradient
// component (backgroundGradient style prop instead — the library's own
// equivalent), and a photo background needs photoDataUri prepared ahead
// of time (see widgetPhoto.ts) since drawing is synchronous once this JSX
// is handed to renderWidget.
function CountdownCard({
  summary,
  photoDataUri,
}: {
  summary: WidgetEventSummary;
  photoDataUri: string | null;
}) {
  const preset = CARD_THEMES[summary.cardTheme] ?? CARD_THEMES.color;
  const isCustom = summary.cardTheme === 'custom';
  const hasPhoto = isCustom && !!photoDataUri;
  const cornerRadius = isCustom ? CORNER_RADIUS[summary.customCornerStyle ?? 'rounded'] : 12;
  const titleWeight = isCustom ? TITLE_WEIGHT[summary.customTextStyle ?? 'system'] : '800';
  const textColor = (hasPhoto ? '#FFFFFF' : preset.text) as WidgetColor;
  const secondaryColor = (summary.cardTheme === 'clean' && !hasPhoto ? preset.secondary : 'rgba(255, 255, 255, 0.8)') as WidgetColor;
  // A photo's own busy detail can sit under any accent color, so text over
  // it always gets a legibility boost — spread into every TextWidget's
  // style below. A per-text shadow instead of MiniWidget's full-card dark
  // scrim: an extra all-black FlexWidget layer stacked via OverlapWidget
  // (photo, scrim, content) rendered as a blank/invisible no-op in
  // testing — text shadow needs no extra stacked layer to get right.
  const photoTextShadow = hasPhoto
    ? { textShadowColor: 'rgba(0, 0, 0, 0.7)' as WidgetColor, textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }
    : {};
  const icon = getCategoryIcon(summary.category).image;
  const { days, hours, minutes } = countdownParts(summary.nextOccurrenceISO);
  const iconSize = 16;
  const countdownEntries: [number, string][] = [
    [days, 'D'],
    [hours, 'H'],
    [minutes, 'M'],
  ];

  // Mirrors MiniWidget's own 'small' content exactly (see its comment) —
  // category icon+label and repeat in a header row, then title, date+time,
  // D/H/M countdown, and note. An array of elements, not a `<>...</>`
  // fragment — this library's own JSX-to-RemoteViews walker
  // (build-widget-tree.ts) calls `element.type(props)` on anything without
  // one of its own widget __name__ tags to resolve plain function
  // components, and a Fragment's `type` is the react.fragment Symbol, not
  // a function, so a bare fragment anywhere in this tree throws
  // "Symbol(react.fragment) is not a function" the moment it's rendered —
  // confirmed via `adb logcat`.
  const content = [
    <FlexWidget key="header" style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'wrap_content' }}>
        <ImageWidget image={icon} imageWidth={iconSize} imageHeight={iconSize} style={{ marginRight: 6, width: iconSize, height: iconSize }} />
        <TextWidget
          text={CATEGORY_LABELS[summary.category]}
          maxLines={1}
          truncate="END"
          style={{ color: textColor, fontSize: 9, fontWeight: '800', width: 'wrap_content', ...photoTextShadow }}
        />
      </FlexWidget>
      <TextWidget
        text={REPEAT_LABELS[summary.repeat]}
        maxLines={1}
        style={{ color: secondaryColor, fontSize: 8, fontWeight: '700', width: 'wrap_content', ...photoTextShadow }}
      />
    </FlexWidget>,
    <FlexWidget key="body" style={{ width: 'match_parent' }}>
      <TextWidget
        text={summary.title}
        maxLines={1}
        truncate="END"
        style={{ color: textColor, fontSize: 12, fontWeight: titleWeight, ...photoTextShadow }}
      />
      <TextWidget
        text={dayjs(summary.nextOccurrenceISO).format('ddd, MMM D · HH:mm')}
        maxLines={1}
        style={{ color: secondaryColor, fontSize: 9, fontWeight: '700', marginTop: 2, ...photoTextShadow }}
      />
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', marginTop: 6 }}>
        {countdownEntries.map(([value, label]) => (
          <FlexWidget key={label} style={{ width: 'wrap_content', marginRight: 10 }}>
            <TextWidget text={String(value)} style={{ color: textColor, fontSize: 15, fontWeight: '800', ...photoTextShadow }} />
            <TextWidget text={label} style={{ color: secondaryColor, fontSize: 7, fontWeight: '700', ...photoTextShadow }} />
          </FlexWidget>
        ))}
      </FlexWidget>
      {summary.note ? (
        <TextWidget
          text={summary.note}
          maxLines={1}
          truncate="END"
          style={{ color: secondaryColor, fontSize: 9, fontWeight: '600', marginTop: 6, ...photoTextShadow }}
        />
      ) : null}
    </FlexWidget>,
  ];

  const cardStyle = {
    height: 'match_parent' as const,
    width: 'match_parent' as const,
    borderRadius: cornerRadius,
    padding: 14,
    justifyContent: 'space-between' as const,
  };

  // 'custom' with a photo that actually resolved — legibility comes from
  // photoTextShadow above, not a separate dark-scrim layer (see its own
  // comment for why). OverlapWidget stacks the photo under the content
  // instead of nesting them, since FlexWidget has no `position: absolute`
  // to layer with.
  if (hasPhoto) {
    return (
      <OverlapWidget clickAction="OPEN_APP" style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <ImageWidget
          image={photoDataUri as `data:image${string}`}
          imageWidth={400}
          imageHeight={400}
          resizeMode="cover"
          style={{ width: 'match_parent', height: 'match_parent' }}
        />
        <FlexWidget style={{ ...cardStyle, borderRadius: 0 }}>{content}</FlexWidget>
      </OverlapWidget>
    );
  }

  // 'color' has no fixed background — fills with the event's own
  // accentColor gradient instead (same fallback 'custom' without a photo
  // yet uses too, matching MiniWidget).
  if (!preset.background) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{ ...cardStyle, backgroundGradient: { from: summary.accentHex, to: darken(summary.accentHex, 0.35) as `#${string}`, orientation: 'TL_BR' } }}
      >
        {content}
      </FlexWidget>
    );
  }

  return (
    <FlexWidget clickAction="OPEN_APP" style={{ ...cardStyle, backgroundColor: preset.background as `#${string}` }}>
      {content}
    </FlexWidget>
  );
}

export function CountdownWidget({
  summary,
  photoDataUri = null,
}: {
  summary: WidgetEventSummary | null;
  photoDataUri?: string | null;
}) {
  if (!summary) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          height: 'match_parent',
          width: 'match_parent',
          backgroundColor: '#2B2640',
          borderRadius: 20,
          padding: 12,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <TextWidget text="No upcoming events" style={{ color: '#FFFFFF', fontSize: 13, textAlign: 'center' }} />
      </FlexWidget>
    );
  }

  return <CountdownCard summary={summary} photoDataUri={photoDataUri} />;
}

// Shared by every render call-site (the headless task handler below,
// ConfigurationScreen's own pick(), and syncHomeScreenWidget.tsx, which
// each hand JSX to react-native-android-widget a different way — a
// callback vs. a returned value) so the "resolve the photo before
// drawing" step — only actually needed for a 'custom' themed event,
// everything else passes null straight through — isn't duplicated three
// times.
export async function buildCountdownWidgetElement(summary: WidgetEventSummary | null): Promise<React.JSX.Element> {
  const photoDataUri = summary?.cardTheme === 'custom' ? await preparePhotoDataUri(summary.customPhotoUri) : null;
  return <CountdownWidget summary={summary} photoDataUri={photoDataUri} />;
}

async function renderSummaryWidget(summary: WidgetEventSummary | null, renderWidget: (el: React.JSX.Element) => void): Promise<void> {
  renderWidget(await buildCountdownWidgetElement(summary));
}

// Which event a *specific* widget instance (identified by its own
// widgetId — Android natively supports multiple independent instances of
// one provider) is configured to show, falling back to the soonest
// upcoming event if nothing's been picked yet (shouldn't normally happen,
// since app.json's widgetFeatures: 'reconfigurable' forces the
// ConfigurationScreen below before a new instance is ever added).
async function resolveSummaryForWidget(widgetId: number): Promise<WidgetEventSummary | null> {
  const events = await listUpcomingEventsForWidgets();
  const configuredId = await getConfiguredEventId(widgetId);
  return events.find((e) => e.id === configuredId) ?? events[0] ?? null;
}

const widgetTaskHandler: WidgetTaskHandler = async ({ widgetAction, widgetInfo, renderWidget }) => {
  if (widgetAction === 'WIDGET_DELETED') {
    await clearConfiguredEventId(widgetInfo.widgetId);
    return;
  }
  const summary = await resolveSummaryForWidget(widgetInfo.widgetId);
  const element = await buildCountdownWidgetElement(summary);
  renderWidget(element);

  // WIDGET_ADDED fires the moment Android binds the new instance — often
  // well before it has any AppWidgetOptions for it yet (min/max width and
  // height, queried via AppWidgetManager.getAppWidgetOptions).
  // react-native-android-widget reads its render size from exactly that
  // bundle (RNWidgetUtil.getWidgetWidth/getWidgetHeight, defaulting to 0
  // when the key is absent) and hands 0×0 straight to
  // Bitmap.createBitmap, which throws ("width and height must be > 0",
  // caught and swallowed on the Java side — confirmed via `adb logcat`,
  // never surfaces here as a JS error), leaving a blank tile on the Home
  // Screen. Genuinely how long that takes to arrive varies by
  // launcher/device (a single ~600ms retry wasn't enough on a Xiaomi/MIUI
  // launcher in testing) — since a fire-and-forget native call gives no
  // success/failure signal to retry on, several re-renders spread over a
  // few seconds is the only lever available here short of patching the
  // library itself, and are cheap/idempotent (same data each time — the
  // photo's already resolved above, not redone per retry).
  if (widgetAction === 'WIDGET_ADDED') {
    for (const delayMs of [500, 1200, 2500, 4500]) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      renderWidget(element);
    }
  }
};

// Called once, early (see app/_layout.tsx) — registers the headless JS task
// Android calls into whenever a CountdownWidget instance is added, resized,
// clicked, or hits its own updatePeriodMillis (app.json). Runs inside this
// app's own JS/AsyncStorage, unlike iOS's widget extension (a separate
// process — see iosWidgetSync.ts for why that side needs an explicit data
// hand-off instead).
export function initAndroidWidgetTaskHandler(): void {
  registerWidgetTaskHandler(widgetTaskHandler);
}

// Entry point for "add this event to my Home Screen" from the event detail
// screen (app/event/[id]/index.tsx), as opposed to the generic, no-event
// "Add to Home Screen" button on the Widgets tab (add-widget-to-home.tsx),
// which leaves the ConfigurationScreen below to show its normal picker.
// Stashing the eventId is the only option — requestPinWidget() only tells
// us whether the user accepted the OS's own "Add to Home screen?" prompt,
// never the widgetId of the instance it goes on to create (the OS decides
// that itself, afterward), so there's no id yet to call
// setConfiguredEventId with directly.
export async function requestPinWidgetForEvent(eventId: string): Promise<boolean> {
  await setPendingConfigureEventId(eventId);
  return requestPinWidget({ widgetName: ANDROID_WIDGET_NAME });
}

// Shown once, automatically, the moment a new CountdownWidget instance is
// dropped on the home screen (app.json's widgetFeatures: 'reconfigurable'
// forces this rather than making it optional) — a plain event list, tap to
// pick. Deliberately not using the app's own useTheme()/PreferencesProvider
// styling: this runs as its own React root (registered separately from
// app/_layout.tsx's tree, see AppRegistry.registerComponent in
// register-widget-configuration-screen's own source), so that context
// isn't available here — hardcoded colors instead.
const ConfigurationScreen: WidgetConfigurationScreen = ({ widgetInfo, renderWidget, setResult }) => {
  const [events, setEvents] = useState<WidgetEventSummary[] | null>(null);

  async function pick(event: WidgetEventSummary) {
    await setConfiguredEventId(widgetInfo.widgetId, event.id);
    await renderSummaryWidget(event, renderWidget);
    setResult('ok');
  }

  useEffect(() => {
    // Both reads happen before any setState, so a pending-event match never
    // gets a chance to render the list first — pick() runs and setResult()
    // closes this screen before the user sees anything but the blank
    // loading view below. A leftover pending id from some earlier,
    // interrupted pin (e.g. the user backed out of the OS prompt) that no
    // longer matches any *upcoming* event just falls through to the normal
    // picker instead of silently doing nothing.
    Promise.all([listUpcomingEventsForWidgets(), takePendingConfigureEventId()]).then(([loaded, pendingEventId]) => {
      const pendingMatch = pendingEventId ? loaded.find((e) => e.id === pendingEventId) : undefined;
      if (pendingMatch) {
        pick(pendingMatch);
        return;
      }
      setEvents(loaded);
    });
  }, []);

  if (!events) return <View style={{ flex: 1, backgroundColor: '#151221' }} />;

  if (events.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#151221', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 15, textAlign: 'center' }}>
          No upcoming events yet — create one in PuraEvents first, then add this widget again.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: '#151221' }}
      data={events}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => pick(item)}
          style={({ pressed }) => ({
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: '#2B2640',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={{ color: '#9992B8', fontSize: 13, marginTop: 2 }}>{dayjs(item.nextOccurrenceISO).format('MMM D, YYYY')}</Text>
        </Pressable>
      )}
    />
  );
};

export function initAndroidWidgetConfigurationScreen(): void {
  registerWidgetConfigurationScreen(ConfigurationScreen);
}
