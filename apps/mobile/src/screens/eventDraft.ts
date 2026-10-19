import dayjs from 'dayjs';
import { useSyncExternalStore } from 'react';

import type { AccentKey } from '../theme/tokens';
import type {
  CardTheme,
  EventCategory,
  NotificationSoundKey,
  PurEvent,
  RepeatRule,
  WidgetCornerStyle,
  WidgetTextStyle,
} from '../types/event';

// The New/Edit Event form's in-progress values. Lives outside React state
// so the wizard's section screens (event/schedule, event/appearance,
// event/advanced, event/share) — separate pushed routes — can edit the
// same draft directly: every change lands here immediately, so leaving a
// section screen by Back (header, gesture or hardware) keeps what was set,
// with no result to hand back. Only one wizard is ever open at a time, and
// it resets this on mount.
export interface EventDraft {
  title: string;
  date: Date;
  category: EventCategory;
  accentColor: AccentKey;
  cardTheme: CardTheme;
  customPhotoUri?: string;
  customWidgetName?: string;
  customOverlayOpacity?: number;
  customCornerStyle?: WidgetCornerStyle;
  customTextStyle?: WidgetTextStyle;
  widgetId?: string;
  repeat: RepeatRule;
  reminders: number[];
  note: string;
  shareMessage: string;
  sender: string;
  customVoiceUri?: string;
  notificationSound: NotificationSoundKey;
}

let draft: EventDraft = newEventDraft([]);
const listeners = new Set<() => void>();

export function newEventDraft(defaultReminderOffsets: number[]): EventDraft {
  return {
    title: '',
    date: new Date(),
    category: 'personal',
    accentColor: 'coral',
    cardTheme: 'color',
    repeat: 'none',
    reminders: defaultReminderOffsets,
    note: '',
    shareMessage: '',
    sender: '',
    notificationSound: 'default',
  };
}

export function resetEventDraft(next: EventDraft) {
  draft = next;
  listeners.forEach((l) => l());
}

export function updateEventDraft(patch: Partial<EventDraft>) {
  draft = { ...draft, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useEventDraft(): EventDraft {
  return useSyncExternalStore(subscribe, () => draft);
}

// What the Appearance preview renders. Nothing entered yet (title still
// blank) shows this placeholder trip instead of the literal empty draft,
// same fixed content as custom-widget.tsx's own DEFAULT_SAMPLE, so a
// brand-new event's widget preview always reads as a real-looking card.
export function draftPreviewEvent(d: EventDraft, timezone: string): PurEvent {
  const isDraftEmpty = d.title.trim().length === 0;
  return {
    id: 'draft',
    title: isDraftEmpty ? 'New York' : d.title.trim(),
    dateTimeISO: isDraftEmpty ? dayjs().add(15, 'day').toISOString() : d.date.toISOString(),
    timezone,
    category: isDraftEmpty ? 'travel' : d.category,
    accentColor: d.accentColor,
    cardTheme: d.cardTheme,
    customPhotoUri: d.customPhotoUri,
    customWidgetName: d.customWidgetName,
    customOverlayOpacity: d.customOverlayOpacity,
    customCornerStyle: d.customCornerStyle,
    customTextStyle: d.customTextStyle,
    widgetId: d.widgetId,
    repeat: isDraftEmpty ? 'none' : d.repeat,
    reminders: d.reminders,
    note: isDraftEmpty ? "Don't forget your passport" : d.note.trim() || undefined,
    shareMessage: d.shareMessage.trim() || undefined,
    sender: d.sender.trim() || undefined,
    customVoiceUri: d.customVoiceUri,
    notificationSound: d.notificationSound,
    createdAt: '',
    updatedAt: '',
  };
}
