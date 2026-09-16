import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { ANDROID_WIDGET_NAME, buildCountdownWidgetElement } from './androidWidgetTask';
import { getConfiguredEventId } from './androidWidgetConfig';
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
    // renderWidget is called once per *existing* instance, each with its
    // own widgetId (WidgetInfo) — every instance re-resolves its own
    // configured event (see androidWidgetTask.ts's identical logic) rather
    // than all instances re-rendering the same "nearest upcoming" event,
    // since different instances can be configured to different events.
    await requestWidgetUpdate({
      widgetName: ANDROID_WIDGET_NAME,
      renderWidget: async (widgetInfo) => {
        const configuredId = await getConfiguredEventId(widgetInfo.widgetId);
        const summary = events.find((e) => e.id === configuredId) ?? events[0] ?? null;
        return buildCountdownWidgetElement(summary);
      },
      widgetNotFound: () => {},
    });
  }
}
