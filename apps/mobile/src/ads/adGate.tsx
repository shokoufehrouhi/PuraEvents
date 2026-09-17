import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { usePro } from '../subscription';

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
}

const AdGateContext = createContext<AdGateValue>({ status: 'loading', retry: () => {} });

// Stands in for a real ad SDK's own "load an ad" call (Google Mobile Ads —
// see docs/PROJECT.md §9's launch checklist, not wired up yet) — an actual
// ad request fails the exact same way this lightweight reachability probe
// does when there's no connectivity (a timed-out/failed network call), so
// this is a faithful placeholder for the *gating behavior* itself without
// needing the real SDK (and a real AdMob account/ad unit IDs, which this
// project doesn't have yet) in place first. Swap this one function out for
// the real ad-load call later; everything below it (context/hook/guard)
// doesn't need to change.
async function attemptAdLoad(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://clients3.google.com/generate_204', { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

// Mounted once near the app root (see app/_layout.tsx) — kicks off the ad
// load attempt in the background on launch/Pro-status change and never
// blocks render while it's pending, per explicit request that a stuck/slow
// ad never hold up the app itself, only the actions gated on it (see
// useGatedAction below).
export function AdGateProvider({ children }: { children: ReactNode }) {
  const { isPro } = usePro();
  const [status, setStatus] = useState<AdGateStatus>('loading');
  // Guards against a slow attempt from a previous Pro/connectivity state
  // resolving after a newer one has already started, and clobbering it.
  const requestId = useRef(0);

  const load = useCallback(() => {
    if (isPro) {
      setStatus('ready');
      return;
    }
    const thisRequest = ++requestId.current;
    setStatus('loading');
    attemptAdLoad().then((ok) => {
      if (thisRequest !== requestId.current) return;
      setStatus(ok ? 'ready' : 'unavailable');
    });
  }, [isPro]);

  useEffect(() => {
    load();
  }, [load]);

  return <AdGateContext.Provider value={{ status, retry: load }}>{children}</AdGateContext.Provider>;
}

export function useAdGate(): AdGateValue {
  return useContext(AdGateContext);
}

// Wraps a mutating action's own handler — call the returned guard() instead
// of the action directly (e.g. a Save/Delete button's onPress). Runs the
// action immediately once the gate is 'ready' (including every Pro user,
// always); shows a blocking error Alert instead of running it while
// 'loading' or 'unavailable' — browsing/navigating elsewhere is completely
// unaffected either way, since nothing here touches rendering.
export function useGatedAction() {
  const { status, retry } = useAdGate();
  const { t } = useTranslation();

  return useCallback(
    (action: () => void | Promise<void>) => {
      if (status === 'ready') {
        action();
        return;
      }
      Alert.alert(t('ads.gateErrorTitle'), t('ads.gateErrorMessage'), [
        { text: t('ads.gateRetry'), onPress: retry },
        { text: t('ads.gateCancel'), style: 'cancel' },
      ]);
    },
    [status, retry, t]
  );
}
