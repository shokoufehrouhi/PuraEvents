import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Row } from '../../src/components/ui/Row';
import { Section } from '../../src/components/ui/Section';
import { useTheme } from '../../src/theme/PreferencesContext';
import { usePro } from '../../src/subscription';
import { responsiveContent, rowBadgeColors } from '../../src/theme/tokens';

function comingSoon() {
  Alert.alert('Coming soon', 'This will be available in a later release.');
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, typography } = useTheme();
  const { isPro } = usePro();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, ...responsiveContent }}>
        <Text style={[typography.title, { color: colors.text, marginBottom: spacing.md }]}>{t('settings.title')}</Text>

        <View
          style={[
            styles.proCard,
            { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },
          ]}
        >
          <View style={[styles.proIcon, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
            <Ionicons name="diamond" size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={[typography.bodyStrong, { color: '#FFFFFF' }]}>{t('settings.proPlan')}</Text>
            <Text style={[typography.caption, { color: 'rgba(255,255,255,0.8)' }]}>
              {isPro ? t('compare.pro') : t('settings.freePlan')}
            </Text>
          </View>
          {!isPro ? (
            <Pressable
              onPress={() => router.push('/upgrade')}
              style={({ pressed }) => [
                styles.viewPlansButton,
                { backgroundColor: '#FFFFFF', borderRadius: radius.md, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[typography.bodyStrong, { color: colors.primary }]}>{t('settings.viewPlans')}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Appearance/Notifications/Data & Privacy stay collapsed into one
            menu row each, drilling into their own screen — but the "About"
            group's 3 items came back out inline per explicit follow-up
            request, instead of being behind their own /support row. */}
        <Section>
          <Row
            icon="color-palette-outline"
            badgeColor={rowBadgeColors.pink}
            label={t('settings.preferences')}
            onPress={() => router.push('/preferences')}
          />
          <Row
            icon="notifications-outline"
            badgeColor={rowBadgeColors.red}
            label={t('settings.notifications')}
            onPress={() => router.push('/notification-settings')}
          />
          <Row
            icon="shield-checkmark-outline"
            badgeColor={rowBadgeColors.green}
            label={t('settings.dataPrivacy')}
            onPress={() => router.push('/data-privacy')}
          />
        </Section>

        <Section title={t('settings.about')}>
          <Row
            icon="help-circle-outline"
            badgeColor={rowBadgeColors.blue}
            label={t('settings.helpFeedback')}
            onPress={() => Linking.openURL('mailto:support@puraevents.app')}
          />
          <Row icon="star-outline" badgeColor={rowBadgeColors.orange} label={t('settings.rateApp')} onPress={() => comingSoon()} />
          <Row
            icon="information-circle-outline"
            badgeColor={rowBadgeColors.purple}
            label={t('settings.about')}
            value={Constants.expoConfig?.version ?? '1.0.0'}
            onPress={() => router.push('/about')}
          />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  proCard: { flexDirection: 'row', alignItems: 'center' },
  proIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  viewPlansButton: { paddingHorizontal: 16, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
});
