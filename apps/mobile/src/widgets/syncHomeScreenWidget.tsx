import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { ANDROID_WIDGET_NAME, buildCountdownWidgetElement } from './androidWidgetTask';
import { syncIOSWidget } from './iosWidgetSync';
import { listUpcomingEventsForWidgets } from './widgetEventSummary';

// Called from storage/events.ts after every create/update/delete, and once
// at app launch (see app/_layout.tsx) — pushes fresh event data out to
// whichever platform's home-screen widget actually exists. Safe to call on
// every platform/every save: @bacons/apple-targets' ExtensionStorage
// itself no-ops when its native module isn't present (see its own
// source), and the Android branch below is skipped outright on iOS, so
// there's no need to platform-guard the imports themselves.
export async function syncHomeScreenWidget(): Promise<void> {
  if (Platform.OS === 'ios') {
    await syncIOSWidget();
    return;
  }

  if (Platform.OS === 'android') {
    const events = await listUpcomingEventsForWidgets();
    // Every instance shows the same soonest-upcoming event — see
    // androidWidgetTask.ts's resolveSummaryForWidget for why there's no
    // more per-widgetId configuration to look up here.
    const summary = events[0] ?? null;
    const element = await buildCountdownWidgetElement(summary);
    await requestWidgetUpdate({
      widgetName: ANDROID_WIDGET_NAME,
      renderWidget: () => element,
      widgetNotFound: () => {},
    });
  }
}
