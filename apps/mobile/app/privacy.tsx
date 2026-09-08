import { ScrollView, Text } from 'react-native';

import { useTheme } from '../src/theme/PreferencesContext';

// Placeholder — real policy text needs legal review before shipping
// (docs/PROJECT.md §8: GDPR/CCPA export & delete requirements).
export default function PrivacyScreen() {
  const { colors, spacing, typography } = useTheme();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={[typography.body, { color: colors.text, lineHeight: 24 }]}>
        PuraEvents stores your events on this device by default. Cloud sync is optional and only used for Pro features
        like group events and cross-device backup.{'\n\n'}
        This placeholder will be replaced with a reviewed Privacy Policy (including GDPR/CCPA data export & delete
        flows) before the app is submitted to the App Store or Google Play.
      </Text>
    </ScrollView>
  );
}
