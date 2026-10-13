import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesError,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

// The 3 IAP products PROJECT.md §5/§6 specs (monthly/yearly auto-renewing,
// plus a one-time Lifetime purchase) — 'lifetime' never has an expiresAt.
export type PlanType = 'monthly' | 'yearly' | 'lifetime';

export interface SubscriptionState {
  isPro: boolean;
  planType?: PlanType;
  // ISO date the current plan renews (monthly/yearly) — undefined for
  // 'lifetime' (never expires) and whenever isPro is false.
  expiresAt?: string;
  // Store page where the user manages/cancels their subscription
  // (required by both stores' auto-renewing subscription rules, see
  // PROJECT.md §9). Null for Lifetime, which has nothing to manage.
  managementURL?: string | null;
  // False until the first CustomerInfo arrives (from RevenueCat's own
  // on-device cache, so this is near-instant and works offline) — lets
  // anything that would otherwise misfire for a Pro user during that
  // first moment (e.g. the cold-start App Open ad) wait for the real answer.
  isReady: boolean;
}

// The single entitlement every product (monthly/yearly/lifetime) unlocks
// in the RevenueCat dashboard — "Pro" is one thing, however it was bought.
export const PRO_ENTITLEMENT_ID = 'pro';

// Public SDK keys (appl_… / goog_…) from the RevenueCat dashboard, via
// .env — see .env.example. Safe to ship in the bundle; they only identify
// the app, they don't grant anything.
const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
});

// Dev-only escape hatch replacing the old MOCK_EXPIRES_AT: set
// EXPO_PUBLIC_FORCE_PRO=1 in .env to test Pro-only UI without a sandbox
// purchase. Ignored in release builds.
const FORCE_PRO = __DEV__ && process.env.EXPO_PUBLIC_FORCE_PRO === '1';

// Module-level store, not per-hook state — usePro() is called from a dozen
// screens at once and all of them must flip together the moment a
// purchase/restore/expiry lands, without each polling on its own.
let state: SubscriptionState = { isPro: false, isReady: false };
const listeners = new Set<() => void>();

function setState(next: SubscriptionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Product ids carry the period in their name on both stores (iOS:
// puraevents_pro_yearly; Android: puraevents_pro:yearly, i.e.
// subscription:basePlan) — see .env.example for the full set.
function planTypeFor(productIdentifier: string, expirationDate: string | null): PlanType {
  if (!expirationDate) return 'lifetime';
  return /year|annual/i.test(productIdentifier) ? 'yearly' : 'monthly';
}

function applyCustomerInfo(info: CustomerInfo) {
  const entitlement = info.entitlements.active[PRO_ENTITLEMENT_ID];
  if (!entitlement) {
    setState({ isPro: false, isReady: true });
    return;
  }
  const planType = planTypeFor(entitlement.productIdentifier, entitlement.expirationDate);
  setState({
    isPro: true,
    planType,
    expiresAt: entitlement.expirationDate ?? undefined,
    managementURL: planType === 'lifetime' ? null : info.managementURL,
    isReady: true,
  });
}

let initialized = false;

// Called once at module scope from app/_layout.tsx, same as the widget
// task handler — must run before any purchase/restore call. Without a key
// (e.g. a fresh clone with no .env) the app just runs as Free instead of
// crashing; the paywall then reports the store as unavailable.
export function initSubscriptions() {
  if (initialized) return;
  initialized = true;

  if (FORCE_PRO) {
    setState({ isPro: true, planType: 'yearly', isReady: true });
    return;
  }
  if (!API_KEY) {
    console.warn('[subscription] No RevenueCat API key for this platform — running as Free. See .env.example.');
    setState({ isPro: false, isReady: true });
    return;
  }

  if (__DEV__) Purchases.setLogLevel(Purchases.LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: API_KEY });
  // Fires on purchase, restore, renewal and expiry alike — this is what
  // replaced the old 15s clock poll for the "Pro lapsed" downgrade.
  Purchases.addCustomerInfoUpdateListener(applyCustomerInfo);
  Purchases.getCustomerInfo()
    .then(applyCustomerInfo)
    .catch(() => setState({ ...state, isReady: true }));
}

export function usePro(): SubscriptionState {
  return useSyncExternalStore(subscribe, () => state);
}

export function isStoreAvailable(): boolean {
  return Boolean(API_KEY) && !FORCE_PRO;
}

// The "current" offering from the RevenueCat dashboard — its monthly/
// annual/lifetime packages carry the real, localized store prices the
// paywall shows. Null when the store can't be reached (offline, no key,
// products not set up yet).
export async function loadProOffering(): Promise<PurchasesOffering | null> {
  if (!isStoreAvailable()) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch {
    return null;
  }
}

// Whether a package comes with a free trial at all — iOS exposes it as a
// $0 intro price, Android as a free phase on the default offer. (Apple
// still decides eligibility itself at purchase time.)
export function hasFreeTrial(pkg: PurchasesPackage | null | undefined): boolean {
  if (!pkg) return false;
  const { product } = pkg;
  if (Platform.OS === 'ios') return product.introPrice?.price === 0;
  return Boolean(product.defaultOption?.freePhase);
}

export type PurchaseOutcome = 'purchased' | 'cancelled';

// withTrial only has teeth on Android, where a subscription's base plan
// (no trial) and its free-trial offer are separate purchasable options.
// On iOS an eligible intro offer is always applied by Apple itself.
export async function purchasePro(pkg: PurchasesPackage, { withTrial }: { withTrial: boolean }): Promise<PurchaseOutcome> {
  try {
    const basePlan = pkg.product.subscriptionOptions?.find((option) => option.isBasePlan);
    const result =
      Platform.OS === 'android' && !withTrial && basePlan
        ? await Purchases.purchaseSubscriptionOption(basePlan)
        : await Purchases.purchasePackage(pkg);
    applyCustomerInfo(result.customerInfo);
    return 'purchased';
  } catch (e) {
    if ((e as PurchasesError).userCancelled) return 'cancelled';
    throw e;
  }
}

// Resolves to whether Pro is active afterwards — false means there was
// nothing on this store account to restore.
export async function restorePro(): Promise<boolean> {
  const info = await Purchases.restorePurchases();
  applyCustomerInfo(info);
  return Boolean(info.entitlements.active[PRO_ENTITLEMENT_ID]);
}

// Free-tier limits, mirrored from docs/PROJECT.md §6.1.
export const FREE_LIMITS = {
  maxActiveEvents: 3,
  maxWidgets: 1,
  maxRemindersPerEvent: 1,
  // Free's one reminder isn't a free choice among the presets — it's
  // fixed to "1 day before" specifically (see reminder-picker.tsx); every
  // other offset is Pro-only regardless of how many are already picked.
  freeReminderOffset: 1440,
};
