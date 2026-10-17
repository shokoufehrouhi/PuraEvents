import type { Ionicons } from '@expo/vector-icons';

import type { RepeatRule } from '../types/event';
import { accents } from './tokens';

// Shared between the Repeat row (Advanced section) and the full-screen
// repeat picker, so the collapsed field shows the same icon/color as the
// picker itself instead of a generic neutral icon.
export const REPEAT_STYLES: Record<RepeatRule, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  none: { color: accents.violet, icon: 'ban' },
  daily: { color: '#8B5CF6', icon: 'sunny' },
  weekdays: { color: '#14B8A6', icon: 'briefcase' },
  weekly: { color: '#2F9BFF', icon: 'repeat' },
  monthly: { color: accents.coral, icon: 'calendar' },
  yearly: { color: accents.mint, icon: 'calendar-number' },
};
