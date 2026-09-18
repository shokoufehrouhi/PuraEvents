import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import {
  FlexWidget,
  ImageWidget,
  OverlapWidget,
  registerWidgetTaskHandler,
  requestPinWidget,
  TextWidget,
  type WidgetTaskHandler,
} from 'react-native-android-widget';

import { getCachedHeroPhotoPath } from '../storage/heroPhoto';
import { CARD_THEMES } from '../theme/cardThemes';
import { getCategoryIcon } from '../theme/icons';
import type { WidgetCornerStyle, WidgetTextStyle } from '../types/event';
import { darken } from '../utils/color';
import { listUpcomingEventsForWidgets, type WidgetEventSummary } from './widgetEventSummary';
import { preparePhotoDataUri } from './widgetPhoto';

// The single app.json provider declaration (name matches its own
// minWidth/minHeight there, tuned to this exact real on-screen footprint
// — see that file's own comment) — registerWidgetTaskHandler below
// registers against it once and handles every instance.
export const ANDROID_WIDGET_NAME = 'CountdownWidgetSmall';

// Same "on-brand violet skyline" fallback EventHeroCard.tsx uses for the
// in-app Today banner when there's no event to theme it with — reused here
// (not a fresh asset) so the zero-events widget reads as the same "hero"
// look instead of a second, different empty state. Plain require(), not a
// data URI — same as getCategoryIcon's own icons below, react-native-
// android-widget's ImageWidget accepts a bundled local asset directly.
const HERO_FALLBACK_IMAGE = require('../../assets/images/hero-fallback.png');
const APP_ICON_IMAGE = require('../../assets/icon.png');

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
  none: 'No repeat',
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
  // Bumped up from an earlier 16px — the card grew from a narrow 110dp to
  // a 165×165dp square (see app.json), so these no longer need to be this
  // conservative to fit; sized to actually fill the room instead of
  // floating in it.
  const iconSize = 20;
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
          style={{ color: textColor, fontSize: 12, fontWeight: '800', width: 'wrap_content', ...photoTextShadow }}
        />
      </FlexWidget>
      <TextWidget
        text={REPEAT_LABELS[summary.repeat]}
        maxLines={1}
        style={{ color: secondaryColor, fontSize: 11, fontWeight: '700', width: 'wrap_content', ...photoTextShadow }}
      />
    </FlexWidget>,
    <FlexWidget key="body" style={{ width: 'match_parent' }}>
      <TextWidget
        text={summary.title}
        maxLines={1}
        truncate="END"
        style={{ color: textColor, fontSize: 16, fontWeight: titleWeight, ...photoTextShadow }}
      />
      <TextWidget
        text={dayjs(summary.nextOccurrenceISO).format('ddd, MMM D · HH:mm')}
        maxLines={1}
        style={{ color: secondaryColor, fontSize: 12, fontWeight: '700', marginTop: 3, ...photoTextShadow }}
      />
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', marginTop: 8 }}>
        {countdownEntries.map(([value, label]) => (
          <FlexWidget key={label} style={{ width: 'wrap_content', marginRight: 14, alignItems: 'center' }}>
            <TextWidget text={String(value)} style={{ color: textColor, fontSize: 20, fontWeight: '800', ...photoTextShadow }} />
            <TextWidget text={label} style={{ color: secondaryColor, fontSize: 9, fontWeight: '700', ...photoTextShadow }} />
          </FlexWidget>
        ))}
      </FlexWidget>
      {summary.note ? (
        <TextWidget
          text={summary.note}
          maxLines={1}
          truncate="END"
          style={{ color: secondaryColor, fontSize: 14, fontWeight: '600', marginTop: 8, ...photoTextShadow }}
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
  heroPhotoDataUri = null,
}: {
  summary: WidgetEventSummary | null;
  photoDataUri?: string | null;
  // Same "Today" banner photo the Events tab's own hero card shows (see
  // storage/heroPhoto.ts) — only ever passed when summary is null (see
  // buildCountdownWidgetElement below), falls back to HERO_FALLBACK_IMAGE
  // when unset (no cached photo yet, or it failed to resolve).
  heroPhotoDataUri?: string | null;
}) {
  if (!summary) {
    // Same hero-photo-with-shadowed-text grammar as CountdownCard's own
    // hasPhoto branch below (OverlapWidget stacking a photo under content,
    // per-text shadow instead of a separate scrim layer) — this is the
    // app's own "hero" look, not a plain empty-state box, per explicit
    // request. Content mirrors EventHeroCard.tsx's own no-event branch
    // exactly (its own comment: "still show the Today banner ... just
    // without a title/countdown") — the "TODAY TRIPS" caption top-left,
    // "Today" + the real current date/time bottom-left, same
    // card:{justifyContent:'space-between'} split between the two. Name+
    // logo sit small underneath that, like ShareCard.tsx's own subtle
    // brand mark, rather than taking over the whole card. English-only
    // (hardcoded date format, not formatEventDateLine/i18n) — same
    // simplification CATEGORY_LABELS/REPEAT_LABELS above already make for
    // this headless context.
    const textShadow = { textShadowColor: 'rgba(0, 0, 0, 0.7)' as WidgetColor, textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } };
    return (
      <OverlapWidget clickAction="OPEN_APP" style={{ height: 'match_parent', width: 'match_parent', borderRadius: 20, padding: 0, overflow: 'hidden' }}>
        <ImageWidget
          image={(heroPhotoDataUri as `data:image${string}`) || HERO_FALLBACK_IMAGE}
          imageWidth={400}
          imageHeight={400}
          resizeMode="cover"
          style={{ width: 'match_parent', height: 'match_parent' }}
        />
        <FlexWidget style={{ height: 'match_parent', width: 'match_parent', padding: 12, justifyContent: 'space-between' }}>
          <TextWidget
            text="TODAY TRIPS"
            style={{ color: 'rgba(255, 255, 255, 0.85)' as WidgetColor, fontSize: 10, fontWeight: '900', ...textShadow }}
          />
          <FlexWidget style={{ width: 'wrap_content' }}>
            <TextWidget text="Today" style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900', ...textShadow }} />
            <TextWidget
              text={dayjs().format('ddd, MMM D, YYYY · HH:mm')}
              style={{ color: 'rgba(255, 255, 255, 0.85)' as WidgetColor, fontSize: 11, fontWeight: '700', marginTop: 3, ...textShadow }}
            />
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'wrap_content', marginTop: 8 }}>
              <ImageWidget
                image={APP_ICON_IMAGE}
                imageWidth={16}
                imageHeight={16}
                style={{ width: 16, height: 16, borderRadius: 4, marginRight: 5 }}
              />
              <TextWidget text="PuraEvents" style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700', ...textShadow }} />
            </FlexWidget>
          </FlexWidget>
        </FlexWidget>
      </OverlapWidget>
    );
  }

  return <CountdownCard summary={summary} photoDataUri={photoDataUri} />;
}

// Shared by every render call-site (the headless task handler below and
// syncHomeScreenWidget.tsx, which each hand JSX to react-native-android-
// widget a different way — a callback vs. a returned value) so the
// "resolve the photo before drawing" step — only actually needed for a
// 'custom' themed event, everything else passes null straight through —
// isn't duplicated.
export async function buildCountdownWidgetElement(summary: WidgetEventSummary | null): Promise<React.JSX.Element> {
  const photoDataUri = summary?.cardTheme === 'custom' ? await preparePhotoDataUri(summary.customPhotoUri) : null;
  // Only worth resolving when there's actually an empty state to show it
  // in — an upcoming event never reads this prop (see CountdownWidget
  // above), so skip the extra AsyncStorage read/image resize otherwise.
  const heroPhotoDataUri = summary ? null : await preparePhotoDataUri(await getCachedHeroPhotoPath());
  return <CountdownWidget summary={summary} photoDataUri={photoDataUri} heroPhotoDataUri={heroPhotoDataUri} />;
}

// Every instance of this provider always shows the same thing: whichever
// event is soonest upcoming, app-wide — there's no per-widgetId
// configuration any more (an earlier version let each instance be pinned to
// a specific event via a configure Activity; deliberately simplified back
// to one auto-updating "nearest event" widget, matching the same "no
// per-instance choice" decision on iOS's widget.swift).
async function resolveSummaryForWidget(): Promise<WidgetEventSummary | null> {
  const events = await listUpcomingEventsForWidgets();
  return events[0] ?? null;
}

// A plain "when did a widget last get added" timestamp, not tied to any
// particular widgetId or event — requestPinWidgetToHomeScreen below polls
// this to tell a real pin from a MIUI-style silent block (see its own
// comment). AsyncStorage, not an in-memory variable: widgetTaskHandler can
// run as a headless JS task in its own isolate, separate from whichever
// screen is doing the polling.
const LAST_WIDGET_ADDED_AT_KEY = 'puraevents:androidWidgetLastAddedAt';

async function markWidgetJustAdded(): Promise<void> {
  await AsyncStorage.setItem(LAST_WIDGET_ADDED_AT_KEY, String(Date.now()));
}

async function getLastWidgetAddedAt(): Promise<number> {
  const raw = await AsyncStorage.getItem(LAST_WIDGET_ADDED_AT_KEY);
  return raw ? Number(raw) : 0;
}

const widgetTaskHandler: WidgetTaskHandler = async ({ widgetAction, renderWidget }) => {
  if (widgetAction === 'WIDGET_DELETED') return;
  const summary = await resolveSummaryForWidget();
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
    await markWidgetJustAdded();
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

// Entry point for the Widgets tab's "Add Widget" banner (add-widget-to-
// home.tsx) — the only way left to pin a real instance, now that there's no
// more per-event variant.
//
// 'declined': the OS-level request itself was rejected/unsupported (the
// normal requestPinWidget() false case).
// 'silentlyBlocked': requestPinWidget() resolved true — Android only
// confirms the *request* reached the launcher, never whether the launcher
// actually went through with it. Confirmed on MIUI via adb logcat: its
// "Home screen shortcuts" permission (off by default, buried in its
// Security app, not a normal Android runtime permission a manifest entry
// or a permission prompt can grant) can silently reject the pin, and
// requestPinWidget() still resolves `true` regardless — there is no path
// for that rejection to reach JS at all. Detected indirectly: widgetTaskHandler's
// own WIDGET_ADDED branch (confirmed to fire reliably even on launchers
// that skip everything else, per that same adb logcat session) stamps
// markWidgetJustAdded() the moment Android actually binds a new instance —
// if that timestamp never moves past `startedAt` within a generous window,
// nothing was actually added. The window has to be genuinely generous (not
// a naive ~8s) — a real, successful add can take a while too (MIUI's own
// placement animation, or this app sitting backgrounded while its
// home-screen confirmation is up), and a false "blocked" on a real success
// is exactly as bad as a false "added" on a real block.
// 'added': a WIDGET_ADDED fired after this call started.
export async function requestPinWidgetToHomeScreen(): Promise<'added' | 'declined' | 'silentlyBlocked'> {
  const startedAt = Date.now();
  const accepted = await requestPinWidget({ widgetName: ANDROID_WIDGET_NAME });
  if (!accepted) return 'declined';
  for (let i = 0; i < 45; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if ((await getLastWidgetAddedAt()) > startedAt) return 'added';
  }
  return 'silentlyBlocked';
}
