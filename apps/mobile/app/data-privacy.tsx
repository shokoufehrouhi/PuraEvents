import { Alert, ScrollView, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Row } from '../src/components/ui/Row';
import { Section } from '../src/components/ui/Section';
import { listEvents } from '../src/storage/events';
import { usePro } from '../src/subscription';
import { useTheme } from '../src/theme/PreferencesContext';
import { rowBadgeColors } from '../src/theme/tokens';

function comingSoon() {
  Alert.alert('Coming soon', 'This will be available in a later release.');
}

// Sub-screen for the Settings "Data & Privacy" menu row — moved out of the
// Settings tab's own inline Section per explicit request that each of its
// 4 top-level menus (Appearance/Notifications/Data & Privacy/About) drill
// into its own screen instead of showing sub-rows inline.
export default function DataPrivacyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { isPro } = usePro();

  // Pro-only, per explicit request — a free user sees the row (with a
  // "Pro" trailing badge instead of a chevron-only nav) and tapping it
  // routes to the paywall instead of exporting, same tappable-not-disabled
  // pattern as the event-detail Share button's own gate.
  async function handleExport() {
    if (!isPro) {
      router.push('/upgrade');
      return;
    }
    const events = await listEvents();
    await Share.share({ message: JSON.stringify(events, null, 2) });
  }

  // Same Pro gate as Import & Export above — Backup & Sync isn't built yet
  // either way (still the comingSoon() placeholder), but a free user still
  // sees the paywall first, not "coming soon", so the gate reads correctly
  // once this row is real.
  function handleBackupSync() {
    if (!isPro) {
      router.push('/upgrade');
      return;
    }
    comingSoon();
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Section>
        <Row
          icon="cloud-outline"
          badgeColor={rowBadgeColors.blue}
          label={t('settings.backupSync')}
          value={isPro ? t('settings.onThisDevice') : t('settings.proOnly')}
          onPress={handleBackupSync}
        />
        <Row
          icon="share-outline"
          badgeColor={rowBadgeColors.purple}
          label={t('settings.importExport')}
          value={isPro ? undefined : t('settings.proOnly')}
          onPress={handleExport}
        />
        <Row
          icon="shield-checkmark-outline"
          badgeColor={rowBadgeColors.green}
          label={t('settings.privacy')}
          onPress={() => router.push('/privacy')}
        />
      </Section>
    </ScrollView>
  );
}
