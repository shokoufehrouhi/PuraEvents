import { FREE_LIMITS } from '../subscription';
import type { Widget } from '../types/event';

// Which saved widgets a free-plan user can still fully use — e.g. right
// after a Pro subscription lapses with more than FREE_LIMITS.maxWidgets
// already saved. Rather than deleting the extras (destructive, and Pro
// might come back), only the most recently *created* ones, up to the
// free limit, stay active; the rest are "frozen": still visible (so
// nothing looks like it silently vanished) but not editable/selectable
// until Pro is active again — see isWidgetFrozen below for the actual
// per-widget check callers use.
export function getActiveWidgetIds(widgets: Widget[], isPro: boolean): Set<string> {
  if (isPro) return new Set(widgets.map((w) => w.id));
  const sorted = [...widgets].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return new Set(sorted.slice(0, FREE_LIMITS.maxWidgets).map((w) => w.id));
}

export function isWidgetFrozen(widget: Widget, activeWidgetIds: Set<string>, isPro: boolean): boolean {
  return !isPro && !activeWidgetIds.has(widget.id);
}
