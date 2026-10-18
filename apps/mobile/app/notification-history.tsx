import dayjs from 'dayjs';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, View } from 'react-native';

import { NotificationDetailModal } from '../src/components/NotificationDetailModal';
import { EmptyState } from '../src/components/ui/EmptyState';
import {
  listNotificationLog,
  markAllNotificationsSeen,
  markNotificationSeen,
  type NotificationLogEntry,
} from '../src/storage/notificationLog';
import { usePreferences, useTheme } from '../src/theme/PreferencesContext';
import { accents } from '../src/theme/tokens';
import { formatCivilDateMonthDay, localizeDigits } from '../src/utils/calendars';

function NotificationRow({ entry, onPress }: { entry: NotificationLogEntry; onPress: () => void }) {
  const { colors, spacing, radius, typography } = useTheme();
  const { prefs } = usePreferences();
  const { i18n } = useTranslation();
  // In the app's language and calendar, like every other date in the app.
  const time = localizeDigits(dayjs(entry.firedAt).format(prefs.timeFormat === '12h' ? 'h:mm A' : 'HH:mm'), i18n.language);
  const timeLabel = `${formatCivilDateMonthDay(entry.firedAt, prefs.calendar, i18n.language)} · ${time}`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing.sm + 4,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {/* Unseen dot — cleared the moment this row is tapped (see onPress
          below), not just the next time the screen is opened. */}
      <View style={{ width: 8, alignItems: 'center', marginTop: 6 }}>
        {!entry.seen ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
      </View>
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={[typography.body, { color: colors.secondary, marginTop: 2 }]} numberOfLines={2}>
          {entry.body}
        </Text>
        <Text style={[typography.caption, { color: colors.secondary, marginTop: 4 }]}>{timeLabel}</Text>
      </View>
    </Pressable>
  );
}

// Settings > Notifications > Notification History — everything the app has
// actually notified the user about (not what's merely scheduled, see
// EventDetail's own Reminder section for that), newest first. See
// notifications/index.ts's listeners for how this log gets built; there's
// no way to reconstruct it after the fact, so it only ever contains what
// fired since that wiring went live.
export default function NotificationHistoryScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const [entries, setEntries] = useState<NotificationLogEntry[]>([]);
  // Tapping a row opens the same full-data popup a real notification tap
  // does (see NotificationDetailModal) — a past entry reads the same
  // whether you're looking at it here or you just tapped it live.
  const [selected, setSelected] = useState<NotificationLogEntry | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listNotificationLog().then((loaded) => {
        if (cancelled) return;
        // Snapshot first (so this visit still renders whichever rows were
        // actually unseen when it opened), *then* mark them seen — the next
        // visit (and the Settings row's own "N new" badge) starts clean.
        setEntries(loaded);
        markAllNotificationsSeen();
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  function handlePress(entry: NotificationLogEntry) {
    setSelected(entry);
    // Clears this row's own dot immediately, not just on the next visit —
    // markAllNotificationsSeen above already persisted every row as seen
    // by the time any tap can happen, this only updates what's on screen
    // *right now* to match.
    if (!entry.seen) {
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, seen: true } : e)));
      markNotificationSeen(entry.id);
    }
  }

  return (
    <>
      <FlatList
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }}
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <NotificationRow entry={item} onPress={() => handlePress(item)} />}
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            badgeIcon="checkmark"
            badgeColor={accents.mint}
            title={t('notificationHistory.emptyTitle')}
            subtitle={t('notificationHistory.emptySubtitle')}
          />
        }
      />
      <NotificationDetailModal notification={selected} onClose={() => setSelected(null)} />
    </>
  );
}
