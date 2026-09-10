import type { AccentKey } from '../theme/tokens';

export type EventCategory = 'personal' | 'work' | 'travel' | 'finance' | 'health' | 'other';

export type RepeatRule = 'none' | 'yearly' | 'monthly' | 'weekly';

/** Free-tier hero card presets (see src/theme/cardThemes.ts). 'custom' is a
 *  user-supplied (or Pro category-gallery) photo background — see
 *  customPhotoUri below. */
export type CardTheme = 'clean' | 'color' | 'dark' | 'custom';

/** Corner radius presets for a 'custom' widget — see custom-widget.tsx. */
export type WidgetCornerStyle = 'sharp' | 'rounded' | 'extraRounded';

/** Title-text weight presets for a 'custom' widget — see custom-widget.tsx.
 *  No new font files are involved, just a fontWeight swap. */
export type WidgetTextStyle = 'system' | 'bold' | 'black';

/** Home-screen widget size — independent of cardTheme/customPhotoUri (the
 *  *look*): you can use a Categories photo at Small just as easily as
 *  Built-in Clean at Large. Picked in New/Edit Event's Appearance section
 *  and in the standalone custom-widget.tsx editor; defaults to 'medium'
 *  when unset. */
export type WidgetSize = 'small' | 'medium' | 'large';

export interface PurEvent {
  id: string;
  title: string;
  /** ISO 8601 UTC instant the event occurs at. */
  dateTimeISO: string;
  /** IANA timezone name the event was created/entered in (for display only in MVP). */
  timezone: string;
  /** Also drives the icon shown on the hero card / list row / detail header — see src/theme/icons.ts. */
  category: EventCategory;
  accentColor: AccentKey;
  cardTheme: CardTheme;
  /** Local file/remote URL used as the widget/hero-card background when
   *  cardTheme === 'custom' — either a user-picked photo (free: 1 event,
   *  Pro: unlimited) or one chosen from the Pro category photo gallery. */
  customPhotoUri?: string;
  /** User-assigned label for the custom widget (see app/custom-widget.tsx)
   *  — identifies it in a future multi-widget gallery; doesn't change what
   *  renders on the widget card itself (that's still the event's title). */
  customWidgetName?: string;
  /** Dark-scrim opacity (0-100) over a 'custom' photo, for text legibility.
   *  Defaults to 35 when unset — see MiniWidget/EventHeroCard. */
  customOverlayOpacity?: number;
  /** Corner radius preset for a 'custom' widget — defaults to 'rounded'. */
  customCornerStyle?: WidgetCornerStyle;
  /** Title-text weight preset for a 'custom' widget — defaults to 'system'. */
  customTextStyle?: WidgetTextStyle;
  /** Which independent Widget (see storage/widgets.ts) the custom* fields
   *  above are a snapshot of, when cardTheme === 'custom' — every widget
   *  card renderer (MiniWidget, EventHeroCard) still reads the custom*
   *  fields directly off the event, so nothing there needs to resolve this.
   *  It exists so "My Widgets" (a saved-widget library) and re-linking a
   *  widget to a *different* event don't depend on scanning events for
   *  customPhotoUri — a widget is its own record now, not just "whatever
   *  is currently on this one event's fields", so switching an event to a
   *  new custom photo, or applying a saved widget elsewhere, can never
   *  silently erase what used to be there. Unset for events that predate
   *  this (storage/widgets.ts backfills one the first time it reads). */
  widgetId?: string;
  /** Home-screen widget size — independent of cardTheme/customPhotoUri, see
   *  WidgetSize. Defaults to 'medium' when unset. */
  widgetSize?: WidgetSize;
  note?: string;
  repeat: RepeatRule;
  /** Minutes-before-event offsets; [0] = "at time of event". */
  reminders: number[];
  createdAt: string;
  updatedAt: string;
}

export type NewEventInput = Omit<PurEvent, 'id' | 'createdAt' | 'updatedAt'>;

/** The bundle of appearance fields app/widget-picker.tsx hands back via the
 *  pickerBridge — a built-in theme key (cardTheme alone) or a full custom
 *  widget's style (all fields), applied onto whichever event opened it. */
export interface WidgetSelection {
  cardTheme: CardTheme;
  customPhotoUri?: string;
  customWidgetName?: string;
  customOverlayOpacity?: number;
  customCornerStyle?: WidgetCornerStyle;
  customTextStyle?: WidgetTextStyle;
  accentColor?: AccentKey;
  /** Set when this selection came from an existing saved Widget (picking
   *  one in "My Widgets", not "+ New custom") — see widgetId on PurEvent. */
  widgetId?: string;
}

/** A saved custom-widget look — see storage/widgets.ts. Independent of any
 *  one event: "My Widgets" lists these directly, and any number of events
 *  can point at the same one via their own widgetId without it being
 *  duplicated or losing whichever one they had before. */
export interface Widget {
  id: string;
  /** User-assigned label (see app/custom-widget.tsx) — falls back to
   *  whichever linked event's own title elsewhere it's shown without one. */
  name?: string;
  /** Local file/remote URL used as the background. */
  photoUri: string;
  /** Dark-scrim opacity (0-100) over the photo, for text legibility.
   *  Defaults to 35 when unset. */
  overlayOpacity?: number;
  /** Corner radius preset — defaults to 'rounded'. */
  cornerStyle?: WidgetCornerStyle;
  /** Title-text weight preset — defaults to 'system'. */
  textStyle?: WidgetTextStyle;
  accentColor?: AccentKey;
  createdAt: string;
  updatedAt: string;
}
