import { Platform } from 'react-native';
import { requireNativeModule } from 'expo';

// Android-only local module (see android/…/ExactAlarmsModule.kt).
const ExactAlarms =
  Platform.OS === 'android'
    ? requireNativeModule<{ canScheduleExact(): boolean; openSettings(): void }>('ExactAlarms')
    : null;

/** Whether reminders fire on the minute. Always true on iOS and on
 *  Android before 12. */
export function canScheduleExactAlarms(): boolean {
  try {
    return ExactAlarms?.canScheduleExact() ?? true;
  } catch {
    return true;
  }
}

/** Opens Android's "Alarms & reminders" screen for this app. */
export function openExactAlarmSettings(): void {
  ExactAlarms?.openSettings();
}
