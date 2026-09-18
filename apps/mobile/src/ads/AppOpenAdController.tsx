import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { TestIds, useAppOpenAd, useForeground } from 'react-native-google-mobile-ads';

import { usePro } from '../subscription';
import { mobileAdsInitPromise } from './mobileAdsInit';

// Real AdMob App Open unit (project: PuraEvents) — same TestIds-in-dev
// policy as adGate.tsx's own interstitial (see that file's comment).
const AD_UNIT_ID = __DEV__
  ? TestIds.APP_OPEN
  : (Platform.select({
      ios: 'ca-app-pub-6967597025156397/5654699582',
      android: 'ca-app-pub-6967597025156397/8061371074',
    }) as string);

// Mounted once near the app root (see app/_layout.tsx), alongside — not
// instead of — AdGateProvider: this one isn't gating anything, it just
// shows an ad on cold start and whenever the app returns to the
// foreground, for free users only. Renders nothing and never delays the
// real UI underneath — Navigation is already mounted before this ad ever
// loads, so even in the worst case (see the risk note below) the app
// itself isn't broken, just visually covered until the user gets past it.
//
// Previously confirmed stuck live on both platforms (a black
// never-closing interstitial on iOS; on Android, logcat showed an
// AdActivity appear and immediately get torn down — "assignParent to
// null" right after — rather than actually presenting) and disabled for a
// session as a result. Root cause traced to a real race: load()/show()
// were being called before the native Mobile Ads SDK's own initialize()
// had resolved (adGate.tsx's interstitial had the exact same unawaited
// mobileAds().initialize() call) — see mobileAdsInit.ts's own comment.
// Re-enabled with that fixed; still needs a fresh real-device check before
// trusting it, since the stuck-ad symptom was only ever a hypothesis
// confirmed by removing the ad path entirely, not by isolating this one
// specific cause. If it reproduces again, disable in app/_layout.tsx the
// same way as before rather than patching further here blind.
export function AppOpenAdController() {
  const { isPro } = usePro();
  const { isLoaded, isClosed, load, show } = useAppOpenAd(AD_UNIT_ID);
  // Only the very first load (cold start) should auto-show — every load
  // after that is either a reload following a shown-and-closed ad (see the
  // isClosed effect below) or one useForeground's own callback already
  // triggers explicitly; without this guard, isLoaded flipping true again
  // after a reload would re-trigger the cold-start effect too.
  const shownOnColdStart = useRef(false);

  // Waits for the shared mobileAdsInitPromise before this ad's own first
  // load() — same fix, same reasoning as adGate.tsx's own interstitial.
  useEffect(() => {
    let cancelled = false;
    mobileAdsInitPromise.then(() => {
      if (!cancelled && !isPro) load();
    });
    return () => {
      cancelled = true;
    };
  }, [isPro, load]);

  // Same "ad's done with the screen, get the next one ready" reasoning as
  // adGate.tsx's own isClosed effect.
  useEffect(() => {
    if (isClosed) load();
  }, [isClosed, load]);

  useEffect(() => {
    if (isPro || shownOnColdStart.current || !isLoaded) return;
    shownOnColdStart.current = true;
    show();
  }, [isPro, isLoaded, show]);

  useForeground(() => {
    if (!isPro && isLoaded) show();
  });

  return null;
}
