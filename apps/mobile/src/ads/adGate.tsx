import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TestIds, useInterstitialAd } from 'react-native-google-mobile-ads';

import { usePro } from '../subscription';
import { mobileAdsInitPromise } from './mobileAdsInit';

// Free-tier "action gate": the monetization model (docs/PROJECT.md §6.1)
// shows ads to free users, and the product decision is that performing a
// mutating action (save/delete an event, save/delete a widget, pin one to
// the Home Screen, ...) requires an ad to actually be available — but a
// failed/unavailable ad (offline, ad network down, ...) must never block
// *browsing* the app, only those actions. Pro removes ads entirely (§6.2),
// so this gate is always 'ready' for a Pro user regardless of connectivity.
export type AdGateStatus = 'loading' | 'ready' | 'unavailable';

interface AdGateValue {
  status: AdGateStatus;
  // Re-attempts the load — exposed for a manual "Retry" affordance (e.g. on
  // the error Alert guard() shows below) once connectivity/ads come back.
  retry: () => void;
  // Shows the loaded interstitial, then runs `action` once it closes — see
  // useGatedAction below, the only intended caller.
  runGated: (action: () => void | Promise<void>) => void;
}

const AdGateContext = createContext<AdGateValue>({ status: 'loading', retry: () => {}, runGated: () => {} });

// Real AdMob interstitial (project: PuraEvents, both apps live under the
// same AdMob account) — always the SDK-provided *test* unit in dev builds,
// per Google's own policy, so interacting with it locally can never read as
// invalid traffic on the real ad unit. __DEV__ is RN's standard global, no
// import needed.
const AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : (Platform.select({
      ios: 'ca-app-pub-6967597025156397/4506636426',
      android: 'ca-app-pub-6967597025156397/6068322077',
    }) as string);

// Mounted once near the app root (see app/_layout.tsx) — kicks off the ad
// load attempt in the background on launch/Pro-status change and never
// blocks render while it's pending, per explicit request that a stuck/slow
// ad never hold up the app itself, only the actions gated on it (see
// useGatedAction below).
export function AdGateProvider({ children }: { children: ReactNode }) {
  const { isPro } = usePro();
  const { isLoaded, isClosed, error, load, show } = useInterstitialAd(AD_UNIT_ID);
  // The gated action waiting on the ad currently on screen — set by
  // runGated, run (and cleared) once the ad reports closed. A ref, not
  // state: this is never rendered, just replayed once.
  const pendingAction = useRef<(() => void | Promise<void>) | null>(null);
  // Safety net for show() presenting nothing visible (confirmed live on a
  // real iPhone: no ad content ever appeared, yet the interstitial's own
  // isClosed never fired either — a stuck full-screen modal blocking every
  // touch underneath, "app hangs" with no error anywhere). Whichever fires
  // first — this timer or the real isClosed effect below — runs the
  // pending action and clears the other's ability to double-run it
  // (pendingAction.current is read-once, see both call sites).
  const stuckAdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runPendingAction = useCallback(() => {
    if (stuckAdTimer.current) {
      clearTimeout(stuckAdTimer.current);
      stuckAdTimer.current = null;
    }
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
    load();
  }, [load]);

  // Waits for the shared mobileAdsInitPromise before this ad's own first
  // load() — see that file's own comment for why this ordering matters.
  useEffect(() => {
    let cancelled = false;
    mobileAdsInitPromise.then(() => {
      if (!cancelled) load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  // isClosed covers both a normal watch-to-completion and the ad failing
  // to actually open when show() was called (see AdHookReturns' own doc) —
  // either way, the interstitial's done with the screen, so the action
  // that was waiting on it can run, and the next one should start loading
  // immediately instead of waiting for the next gated action to ask for it.
  useEffect(() => {
    if (!isClosed) return;
    runPendingAction();
  }, [isClosed, runPendingAction]);

  const status: AdGateStatus = isPro || isLoaded ? 'ready' : error ? 'unavailable' : 'loading';

  const runGated = useCallback(
    (action: () => void | Promise<void>) => {
      if (isPro) {
        action();
        return;
      }
      pendingAction.current = action;
      show();
      // 6s — comfortably longer than a real interstitial's own open
      // transition, short enough that a genuinely stuck ad doesn't leave
      // the user stranded for long. See runPendingAction's own comment.
      stuckAdTimer.current = setTimeout(runPendingAction, 6000);
    },
    [isPro, show, runPendingAction]
  );

  return <AdGateContext.Provider value={{ status, retry: load, runGated }}>{children}</AdGateContext.Provider>;
}

export function useAdGate(): AdGateValue {
  return useContext(AdGateContext);
}

// Wraps a mutating action's own handler — call the returned guard() instead
// of the action directly (e.g. a Save/Delete button's onPress). Shows the
// interstitial and runs the action once it closes when the gate is 'ready'
// (Pro skips straight to the action, no ad); shows a blocking error Alert
// instead while 'loading' or 'unavailable' — browsing/navigating elsewhere
// is completely unaffected either way, since nothing here touches
// rendering until the action itself is actually invoked.
export function useGatedAction() {
  const { status, retry, runGated } = useAdGate();
  const { t } = useTranslation();

  return useCallback(
    (action: () => void | Promise<void>) => {
      if (status === 'ready') {
        runGated(action);
        return;
      }
      Alert.alert(t('ads.gateErrorTitle'), t('ads.gateErrorMessage'), [
        { text: t('ads.gateRetry'), onPress: retry },
        { text: t('ads.gateCancel'), style: 'cancel' },
      ]);
    },
    [status, retry, runGated, t]
  );
}
