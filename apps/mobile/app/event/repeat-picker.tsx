import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePreferences } from '../../src/theme/PreferencesContext';
import { REPEAT_STYLES } from '../../src/theme/repeatStyles';
import type { RepeatRule } from '../../src/types/event';
import { civilDayOfMonth, formatCivilDateMonthDay, shouldUseFarsiDigits, toPersianDigits } from '../../src/utils/calendars';
import { resolvePick } from '../../src/utils/pickerBridge';
import { isWeekdaysRule, weekdaysRuleFor } from '../../src/utils/recurrence';
import { flipInRTL } from '../../src/utils/rtl';

// English ordinal suffix — only meaningful for the Gregorian calendar (a
// bare day number reads fine in Persian/Islamic contexts without one).
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const REPEATS: RepeatRule[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'];

// Full-screen repeat picker matching the approved design: each option has
// its own accent color and a date-aware description ("Every week on
// Wednesday"). Tapping a row selects it and closes immediately — same
// interaction as the category picker, no separate Done step.
export default function RepeatPickerScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography, prefs } = usePreferences();
  const { current, date: dateParam } = useLocalSearchParams<{ current?: string; date?: string }>();

  const dateISO = dayjs(dateParam).toISOString();
  const useFarsiDigits = shouldUseFarsiDigits(i18n.language);

  function describeRepeat(key: RepeatRule): string {
    switch (key) {
      case 'daily':
        return t('events.repeatDailyDesc');
      case 'weekdays':
        return t('events.repeatWeekdaysDesc');
      case 'weekdaysSun':
        return t('events.repeatWeekdaysSunDesc');
      case 'weekdaysSat':
        return t('events.repeatWeekdaysSatDesc');
      case 'weekly':
        return t('events.repeatWeeklyDesc', { day: dayjs(dateISO).format('dddd') });
      case 'monthly': {
        const day = civilDayOfMonth(dateISO, prefs.calendar);
        const dayLabel = prefs.calendar === 'gregorian' ? ordinal(day) : useFarsiDigits ? toPersianDigits(day) : day;
        return t('events.repeatMonthlyDesc', { day: dayLabel });
      }
      case 'yearly':
        return t('events.repeatYearlyDesc', { date: formatCivilDateMonthDay(dateISO, prefs.calendar, i18n.language) });
      case 'none':
      default:
        return t('events.repeatNoneDesc');
    }
  }

  // One "Weekdays" option: the event's own work week when it already
  // repeats on weekdays (its days never shift), otherwise the one that
  // starts on Preferences > First day of week.
  const weekdaysKey = current && isWeekdaysRule(current as RepeatRule) ? (current as RepeatRule) : weekdaysRuleFor(prefs.firstDayOfWeek);
  const options = REPEATS.map((key) => (key === 'weekdays' ? weekdaysKey : key));

  function pick(repeat: RepeatRule) {
    resolvePick(repeat);
    router.back();
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { padding: spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} style={flipInRTL} />
        </Pressable>
        <Text style={[typography.bodyStrong, { color: colors.text }]}>{t('events.repeatLabel')}</Text>
        <View style={{ width: 24 }} />
      </View>
      <Text style={[typography.caption, { color: colors.secondary, textAlign: 'center', marginBottom: spacing.md }]}>
        {t('events.repeatSubtitle')}
      </Text>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, paddingTop: 0 }}>
        <View style={styles.list}>
          {options.map((key) => {
            const { color, icon } = REPEAT_STYLES[key];
            const isSelected = current === key;
            return (
              <Pressable
                key={key}
                onPress={() => pick(key)}
                style={[
                  styles.row,
                  { backgroundColor: isSelected ? color : `${color}1A`, borderRadius: radius.lg, padding: spacing.md },
                ]}
              >
                <View style={[styles.iconBadge, { backgroundColor: isSelected ? '#fff' : color, borderRadius: radius.md }]}>
                  <Ionicons name={icon} size={20} color={isSelected ? color : '#fff'} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[typography.bodyStrong, { color: isSelected ? '#fff' : colors.text, fontSize: 17 }]}>
                    {t(`events.repeat.${key}`)}
                  </Text>
                  <Text style={[typography.caption, { color: isSelected ? 'rgba(255,255,255,0.85)' : colors.secondary, marginTop: 2 }]}>
                    {describeRepeat(key)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    { borderColor: isSelected ? '#fff' : color, backgroundColor: isSelected ? '#fff' : 'transparent' },
                  ]}
                >
                  {isSelected ? <Ionicons name="checkmark" size={16} color={color} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  list: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconBadge: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, marginLeft: 14 },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
