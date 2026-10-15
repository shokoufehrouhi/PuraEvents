import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import { Linking, Platform } from 'react-native';

const ANDROID_PACKAGE = Constants.expoConfig?.android?.package ?? 'com.puraapps.puraevents';

/** The Settings "Rate PuraEvents" row. On Android it opens the Play
 *  listing directly: Play's in-app review sheet is quota-limited and
 *  silently shows nothing when the quota is spent, which reads as a dead
 *  button. iOS has no App Store id yet, so it uses the system review
 *  prompt, falling back to the store page once one is configured. */
export async function rateApp(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await Linking.openURL(`market://details?id=${ANDROID_PACKAGE}&showAllReviews=true`);
    } catch {
      // No Play Store app (e.g. some emulators): the web listing instead.
      await Linking.openURL(`https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`);
    }
    return;
  }
  const storeUrl = StoreReview.storeUrl();
  if (await StoreReview.isAvailableAsync()) {
    await StoreReview.requestReview();
  } else if (storeUrl) {
    await Linking.openURL(storeUrl);
  }
}
