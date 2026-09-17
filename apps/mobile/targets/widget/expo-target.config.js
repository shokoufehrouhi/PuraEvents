/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'PuraEventsWidget',
  displayName: 'PuraEvents Countdown',
  // Matches src/theme/tokens.ts' primary accent — used as the tint color
  // when the user is editing/removing the widget from the home screen,
  // not the widget's own content color (that's read live off the shared
  // event data, see widget.swift).
  colors: {
    $accent: '#6558D9',
  },
  // No 'AppIntents' any more — widget.swift dropped AppIntentConfiguration
  // (the old "user picks which event this widget shows" Edit Widget
  // picker) along with the per-instance choice it enabled, back to one
  // plain TimelineProvider/StaticConfiguration. That didn't let
  // deploymentTarget drop to match the main app's own 16.4 though (tried
  // it, confirmed via a real device build): widget.swift's own
  // .containerBackground(_:for:) — the modifier WidgetKit itself requires
  // for a widget's background, replacing plain .background() — is an iOS
  // 17+ API on its own, unrelated to AppIntents. Still higher than the
  // host app, same normal/well-understood tradeoff as before: the widget
  // just won't be offered on iOS 16.4–16.x, the main app stays fully
  // usable there regardless.
  frameworks: ['SwiftUI', 'WidgetKit'],
  deploymentTarget: '17.0',
  entitlements: {
    // Same App Group as app.json's ios.entitlements and
    // src/widgets/iosWidgetSync.ts's WIDGET_APP_GROUP — all three must
    // agree on this exact string or the app and the widget end up reading/
    // writing two different sandboxed containers with the same name.
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
