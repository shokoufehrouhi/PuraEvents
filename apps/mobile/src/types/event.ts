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
}
