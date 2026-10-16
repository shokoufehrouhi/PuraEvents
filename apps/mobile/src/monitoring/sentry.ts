import * as Sentry from '@sentry/react-native';

// Crash and error reports to Sentry (project pura-65/puraevents, EU region).
// Release builds only — in development errors already show on screen, and
// they'd only add noise. The DSN isn't a secret (Sentry's docs say it may
// ship in the app); it comes from .env so a fork can't report into ours.
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initCrashReporting(): void {
  Sentry.init({
    dsn: DSN,
    enabled: !__DEV__ && !!DSN,
    // No IP address, user or device identifiers beyond what a crash
    // needs (model, OS, app version) — see the privacy policy.
    sendDefaultPii: false,
    // Errors only: no performance tracing, no session replay.
    tracesSampleRate: 0,
    beforeBreadcrumb(breadcrumb) {
      // Console output can contain event titles or notes the user typed.
      if (breadcrumb.category === 'console') return null;
      // Request URLs keep their path but lose the query (e.g. the city
      // name sent to Pexels for the Today photo).
      const url = breadcrumb.data?.url;
      if (typeof url === 'string' && url.includes('?')) {
        breadcrumb.data = { ...breadcrumb.data, url: url.split('?')[0] };
      }
      return breadcrumb;
    },
  });
}

export const wrapWithCrashReporting = Sentry.wrap;
