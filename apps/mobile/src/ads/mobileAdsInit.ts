import mobileAds, {
  AdsConsent,
  AdsConsentDebugGeography,
  AdsConsentPrivacyOptionsRequirementStatus,
} from 'react-native-google-mobile-ads';

// Dev-only switch to see the EEA consent form without being in Europe:
// EXPO_PUBLIC_ADS_DEBUG_EEA=1 in .env (emulators count as test devices; a
// real phone also needs its id in testDeviceIdentifiers, which the UMP SDK
// logs to logcat/Xcode on first run).
const DEBUG_EEA = __DEV__ && process.env.EXPO_PUBLIC_ADS_DEBUG_EEA === '1';

// Google's EU User Consent Policy: in the EEA/UK/Switzerland, ask for
// consent (Google's UMP form, configured under AdMob → Privacy & messaging)
// before requesting any ad. gatherConsent() decides by the device's region
// — elsewhere it shows nothing — and only shows the form when it's needed
// (first launch, or when the message changes). Then the Mobile Ads SDK is
// initialized, and only if ads may be requested at all.
//
// Initializing before any load()/show() also matters on its own: ads
// requested before initialize() resolved were the cause of the stuck
// full-screen ad bug (a black never-closing interstitial on iOS, an
// AdActivity torn down right away on Android).
async function gatherConsentThenInitialize(): Promise<boolean> {
  try {
    await AdsConsent.gatherConsent(DEBUG_EEA ? { debugGeography: AdsConsentDebugGeography.EEA } : undefined);
  } catch {
    // Offline or the form failed to load — canRequestAds below still
    // reflects any consent given on an earlier launch.
  }
  const { canRequestAds } = await AdsConsent.getConsentInfo().catch(() => ({ canRequestAds: false }));
  if (!canRequestAds) return false;
  await mobileAds().initialize();
  return true;
}

let adsReady: Promise<boolean> | null = null;

/** Consent first, then the SDK — started once, by the first ad consumer
 *  that runs for a free user (Pro has no ads, so never sees the form).
 *  Resolves false when ads may not be requested; callers must then skip
 *  ads entirely rather than wait for one. */
export function initAdsOnce(): Promise<boolean> {
  adsReady ??= gatherConsentThenInitialize();
  return adsReady;
}

/** Whether the user's region needs a way to revisit their ad consent
 *  (Data & Privacy shows "Ad privacy options" when it does). */
export async function adPrivacyOptionsRequired(): Promise<boolean> {
  try {
    const info = await AdsConsent.getConsentInfo();
    return info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
  } catch {
    return false;
  }
}

export function showAdPrivacyOptions(): Promise<unknown> {
  return AdsConsent.showPrivacyOptionsForm();
}
