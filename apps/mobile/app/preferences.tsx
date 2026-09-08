import * as Localization from 'expo-localization';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { EventHeroCard } from '../src/components/EventHeroCard';
import { Row } from '../src/components/ui/Row';
import { Section } from '../src/components/ui/Section';
import { SegmentedControl } from '../src/components/ui/SegmentedControl';
import i18n from '../src/i18n';
import { usePreferences, useTheme } from '../src/theme/PreferencesContext';
import { rowBadgeColors } from '../src/theme/tokens';
import type { PurEvent } from '../src/types/event';
import { fetchLocationPhotoUrl, getLocalPlaceName } from '../src/utils/locationPhoto';
import { awaitPick } from '../src/utils/pickerBridge';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  fa: 'فارسی',
  ar: 'العربية',
  es: 'Español',
  de: 'Deutsch',
  tr: 'Türkçe',
};

export default function PreferencesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const { prefs, setPrefs } = usePreferences();
  const [previewPhotoUri, setPreviewPhotoUri] = useState<string | null>(null);
  const deviceTimezone = Localization.getCalendars()[0]?.timeZone ?? '—';
  // When automatic is on, this always reflects the device — matches the
  // toggle's own meaning and can't be edited. When it's off, it's whatever
  // was last manually picked (falling back to the device zone the first
  // time, before any manual pick has ever been made).
  const currentTimezone = prefs.autoTimezone ? deviceTimezone : prefs.manualTimezone ?? deviceTimezone;
  // The Preview card's photo and title should reflect this same effective
  // timezone (manual override or device) rather than always the device's —
  // e.g. picking Tokyo here should turn it into an actual "Tokyo Trip" with
  // a Tokyo photo, not the fixed sample it was before.
  const previewCity = getLocalPlaceName(currentTimezone);
  const [previewTargetISO] = useState(() => new Date(Date.now() + 18 * 86400000 + 6 * 3600000 + 24 * 60000).toISOString());
  const previewEvent: PurEvent = {
    id: 'preview',
    title: t('preferences.previewTripTitle', { city: previewCity }),
    dateTimeISO: previewTargetISO,
    timezone: currentTimezone,
    category: 'travel',
    accentColor: 'coral',
    cardTheme: 'color',
    repeat: 'none',
    reminders: [],
    createdAt: '',
    updatedAt: '',
  };

  async function openTimezonePicker() {
    if (prefs.autoTimezone) return;
    router.push({ pathname: '/timezone-picker', params: { current: currentTimezone } });
    const picked = await awaitPick();
    setPrefs({ manualTimezone: picked });
  }

  // Same helper the Events tab's own "Today" banner uses, but for
  // *this* screen's effective timezone (not always the device's) — so
  // toggling Automatic or picking a different manual zone refetches a
  // matching photo instead of always showing wherever the device is.
  useEffect(() => {
    let cancelled = false;
    fetchLocationPhotoUrl(currentTimezone).then((url) => {
      if (!cancelled) setPreviewPhotoUri(url);
    });
    return () => {
      cancelled = true;
    };
  }, [currentTimezone]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Section title={t('preferences.appearance')}>
        <View style={{ padding: spacing.md }}>
          <SegmentedControl
            value={prefs.appearance}
            onChange={(v) => setPrefs({ appearance: v })}
            options={[
              { value: 'system', label: t('preferences.system') },
              { value: 'light', label: t('preferences.light') },
              { value: 'dark', label: t('preferences.dark') },
            ]}
          />
        </View>
      </Section>

      <Section>
        <Row
          icon="globe-outline"
          badgeColor={rowBadgeColors.blue}
          label={t('preferences.language')}
          value={LANGUAGE_NAMES[i18n.language] ?? i18n.language}
          onPress={() => router.push('/language-picker')}
        />
      </Section>

      <Section title={t('preferences.calendar')}>
        <View style={{ padding: spacing.md }}>
          <SegmentedControl
            value={prefs.calendar}
            onChange={(v) => setPrefs({ calendar: v })}
            options={[
              { value: 'gregorian', label: t('preferences.gregorian') },
              { value: 'persian', label: t('preferences.persian') },
              { value: 'islamic', label: t('preferences.islamic') },
            ]}
          />
        </View>
        <View style={{ padding: spacing.md }}>
          <Text style={[typography.label, { color: colors.secondary, marginBottom: 8 }]}>{t('preferences.firstDayOfWeek')}</Text>
          <SegmentedControl
            value={prefs.firstDayOfWeek}
            onChange={(v) => setPrefs({ firstDayOfWeek: v })}
            options={[
              { value: 6, label: t('preferences.saturday') },
              { value: 0, label: t('preferences.sunday') },
              { value: 1, label: t('preferences.monday') },
            ]}
          />
        </View>
      </Section>

      <Section title={t('preferences.timeFormat')}>
        <View style={{ padding: spacing.md }}>
          <SegmentedControl
            value={prefs.timeFormat}
            onChange={(v) => setPrefs({ timeFormat: v })}
            options={[
              { value: '12h', label: t('preferences.12h') },
              { value: '24h', label: t('preferences.24h') },
            ]}
          />
        </View>
      </Section>

      <Section title={t('preferences.timezone')}>
        <Row
          type="switch"
          icon="time-outline"
          label={t('preferences.autoTimezone')}
          value={prefs.autoTimezone}
          onValueChange={(v) => setPrefs({ autoTimezone: v })}
        />
        <Row
          icon="location-outline"
          label={t('preferences.currentTimezone')}
          value={currentTimezone}
          onPress={prefs.autoTimezone ? undefined : openTimezonePicker}
        />
      </Section>

      <Text style={[typography.label, { color: colors.secondary, marginBottom: spacing.sm }]}>Preview</Text>
      <EventHeroCard
        event={previewEvent}
        height={140}
        photoUri={previewPhotoUri ?? undefined}
        showPhoto
        countdownNumberSize={24}
        countdownLabelSize={8}
        titleSize={20}
      />
    </ScrollView>
  );
}
