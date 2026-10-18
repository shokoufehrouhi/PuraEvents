import dayjs from 'dayjs';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';

import { describeOffset, type NotificationInfo } from '../notifications';
import { getEvent } from '../storage/events';
import { usePreferences, useTheme } from '../theme/PreferencesContext';
import { formatCivilDateFull, localizeDigits } from '../utils/calendars';
import { getNextOccurrence } from '../utils/recurrence';
import { Button } from './ui/Button';

interface Props {
  /** null hides the modal — same "controlled by the caller's own state"
   *  shape as the rest of the app's pickers/sheets. */
  notification: NotificationInfo | null;
  onClose: () => void;
}

// Shared by app/_layout.tsx (a real OS notification tap, from any screen or
// even a cold start) and app/notification-history.tsx (tapping a past
// entry in-app) — same "show everything this notification carried" popup
// either way, so a notification reads the same regardless of how you
// opened it.
export function NotificationDetailModal({ notification, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const { prefs } = usePreferences();
  const router = useRouter();
  const { colors, radius, spacing, typography } = useTheme();
  // How long until the event's *next* occurrence, computed fresh from now
  // (not the offset this particular reminder fired for) — null while
  // looking it up, or if the notification has no linked event at all.
  const [timeUntilEvent, setTimeUntilEvent] = useState<string | null>(null);
  // Reset synchronously during render (the "adjusting state while
  // rendering" pattern, see MiniWidget.tsx's own photoFailed reset) so a
  // *new* notification doesn't flash the previous one's stale value
  // before its own lookup below resolves.
  const [checkedId, setCheckedId] = useState<string | null>(null);
  if ((notification?.id ?? null) !== checkedId) {
    setCheckedId(notification?.id ?? null);
    setTimeUntilEvent(null);
  }

  useEffect(() => {
    if (!notification?.eventId) return;
    let cancelled = false;
    getEvent(notification.eventId).then((event) => {
      if (cancelled || !event) return;
      const next = getNextOccurrence(event.dateTimeISO, event.repeat);
      const minutesLeft = next.diff(dayjs(), 'minute');
      setTimeUntilEvent(minutesLeft <= 0 ? null : describeOffset(minutesLeft));
    });
    return () => {
      cancelled = true;
    };
  }, [notification]);

  return (
    <Modal visible={!!notification} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}
        onPress={onClose}
      >
        {/* Inner Pressable with a no-op onPress so tapping the card itself
            doesn't bubble to the backdrop's dismiss handler. */}
        <Pressable onPress={() => {}} style={{ width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }}>
          <Text style={[typography.headline, { color: colors.text }]}>{notification?.title}</Text>
          <Text style={[typography.body, { color: colors.secondary, marginTop: 6 }]}>{notification?.body}</Text>

          <View style={{ marginTop: spacing.md, gap: 4 }}>
            {notification?.eventId ? (
              <Text style={[typography.caption, { color: colors.secondary }]}>
                {t('notificationPopup.eventIdLabel')}: {notification.eventId}
              </Text>
            ) : null}
            <Text style={[typography.caption, { color: colors.secondary }]}>
              {t('notificationPopup.sentLabel')}: {notification
                ? `${formatCivilDateFull(notification.firedAt, prefs.calendar, i18n.language)} · ${localizeDigits(
                    dayjs(notification.firedAt).format(prefs.timeFormat === '12h' ? 'h:mm A' : 'HH:mm'),
                    i18n.language,
                  )}`
                : ''}
            </Text>
            {timeUntilEvent ? (
              <Text style={[typography.caption, { color: colors.secondary }]}>
                {t('notificationPopup.timeUntilLabel')}: {timeUntilEvent}
              </Text>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', marginTop: spacing.md }}>
            {notification?.eventId ? (
              <Button
                label={t('notificationPopup.viewEvent')}
                onPress={() => {
                  const eventId = notification.eventId;
                  onClose();
                  router.push(`/event/${eventId}`);
                }}
                style={{ flex: 1, marginRight: 8 }}
              />
            ) : null}
            <Button label={t('notificationPopup.close')} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
