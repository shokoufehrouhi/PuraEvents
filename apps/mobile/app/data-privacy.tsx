import { Alert, ScrollView, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Row } from '../src/components/ui/Row';
import { Section } from '../src/components/ui/Section';
import { listEvents } from '../src/storage/events';
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

  async function handleExport() {
    const events = await listEvents();
    await Share.share({ message: JSON.stringify(events, null, 2) });
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Section>
        <Row
          icon="cloud-outline"
          badgeColor={rowBadgeColors.blue}
          label={t('settings.backupSync')}
          value={t('settings.onThisDevice')}
          onPress={() => comingSoon()}
        />
        <Row icon="share-outline" badgeColor={rowBadgeColors.purple} label={t('settings.importExport')} onPress={handleExport} />
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
