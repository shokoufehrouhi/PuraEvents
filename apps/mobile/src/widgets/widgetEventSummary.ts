import dayjs from 'dayjs';

import { listEvents } from '../storage/events';
import { accents } from '../theme/tokens';
import type { CardTheme, EventCategory, RepeatRule, WidgetCornerStyle, WidgetTextStyle } from '../types/event';
import { getNextOccurrence } from '../utils/recurrence';

// What a widget instance (WidgetKit on iOS, AppWidget on Android) needs to
// render, and what each platform's "which event does this widget show"
// configuration picker lists — a plain, JSON-serializable snapshot, not a
// full PurEvent. iOS's own widget extension is a totally separate process
// with no access to this app's storage at all, so this same shape gets
// written to the shared App Group (see iosWidgetSync.ts); Android's
// headless widget task/configuration screen run inside this app's own JS,
// so they can just call listUpcomingEventsForWidgets directly.
export interface WidgetEventSummary {
  id: string;
  title: string;
  /** Next occurrence, already resolved for a repeating event — neither
   *  widget side ever needs to know about RepeatRule. */
  nextOccurrenceISO: string;
  /** Matches accents' own literal hex strings (see theme/tokens.ts). */
  accentHex: `#${string}`;
  category: EventCategory;
  repeat: RepeatRule;
  note?: string;
  cardTheme: CardTheme;
  /** Relative path (see persistImage.ts), not a ready-to-render URI —
   *  Android's CountdownWidget resolves+downsizes it into a data: URI
   *  itself (see widgetPhoto.ts) only when actually about to draw a
   *  'custom' themed instance. iOS can't do that same on-demand resolve —
   *  widget.swift runs as a separate process with no file-system/
   *  expo-image-manipulator access — so iosWidgetSync.ts pre-resolves this
   *  into its own `photoDataUri` field (not part of this shared shape)
   *  before handing the summary across the App Group. */
  customPhotoUri?: string;
  customOverlayOpacity?: number;
  customCornerStyle?: WidgetCornerStyle;
  customTextStyle?: WidgetTextStyle;
}

// Capped, not the full event list — a widget's own "choose an event"
// picker (both platforms) only ever needs to offer what's actually still
// upcoming, soonest first, and there's no reason to hand either platform
// hundreds of entries if someone has that many events.
const MAX_EVENTS = 30;

// Same "soonest upcoming" definition/filter as the Events tab's own
// Upcoming list (app/(tabs)/index.tsx) — a repeating event's next
// occurrence is always upcoming by definition, only a one-time event can
// be past.
export async function listUpcomingEventsForWidgets(): Promise<WidgetEventSummary[]> {
  const events = await listEvents();
  const now = dayjs();

  return events
    .map((event) => ({ event, next: getNextOccurrence(event.dateTimeISO, event.repeat, now) }))
    .filter(({ event, next }) => event.repeat !== 'none' || next.isAfter(now))
    .sort((a, b) => a.next.valueOf() - b.next.valueOf())
    .slice(0, MAX_EVENTS)
    .map(({ event, next }) => ({
      id: event.id,
      title: event.title,
      nextOccurrenceISO: next.toISOString(),
      accentHex: accents[event.accentColor] ?? accents.violet,
      category: event.category,
      repeat: event.repeat,
      note: event.note,
      cardTheme: event.cardTheme,
      customPhotoUri: event.customPhotoUri,
      customOverlayOpacity: event.customOverlayOpacity,
      customCornerStyle: event.customCornerStyle,
      customTextStyle: event.customTextStyle,
    }));
}
