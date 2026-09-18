import mobileAds from 'react-native-google-mobile-ads';

// Started once at module load (not per-component-mount, and not re-created
// on every render) — shared by every ad consumer in the app (adGate.tsx's
// interstitial, AppOpenAdController). Both used to call load()/show() in
// their own effects without ever waiting on this, which is the likely
// actual cause of the "stuck ad" bug confirmed live on both platforms (a
// black never-closing interstitial on iOS, an AdActivity that appears and
// is immediately torn down on Android) — requesting/showing an ad before
// the native Mobile Ads SDK itself has finished initializing is a
// documented cause of exactly this kind of broken rendering. Every ad
// consumer should `await mobileAdsInitPromise` before its own first
// load()/show() call.
export const mobileAdsInitPromise = mobileAds().initialize();
