import { ScrollView, Text, View } from 'react-native';

import { useTheme } from '../src/theme/PreferencesContext';

const LAST_UPDATED = 'September 14, 2026';

// English-only, deliberately — same reasoning as privacy.tsx: subscription/
// liability language needs to say exactly what it means, and a
// machine-translated EULA risks getting that wrong across 5 more locales
// without native-speaker legal review. Real-world apps commonly ship legal
// docs in one canonical language for exactly this reason.
const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: '1. The App',
    body:
      'PuraEvents is a personal countdown and event-reminder app. A free version and an optional Pro subscription are ' +
      "offered, as described on the app's Upgrade screen. By downloading, installing, or using the app, you agree to " +
      'these Terms of Use.',
  },
  {
    heading: '2. Subscriptions',
    body:
      'PuraEvents Pro is offered as an auto-renewing Monthly or Yearly subscription, or a one-time Lifetime purchase, ' +
      'at the prices shown in the app at the time of purchase. Payment is charged to your Apple ID or Google Play ' +
      'account at confirmation of purchase. Monthly and Yearly subscriptions renew automatically unless auto-renew is ' +
      'turned off at least 24 hours before the end of the current period; your account is charged for renewal within ' +
      '24 hours prior to that, at the price you originally agreed to unless you were notified of a change in advance. ' +
      'Any unused portion of a free trial is forfeited once a subscription is purchased, where applicable. You can ' +
      "manage or cancel a subscription any time in your Apple ID (Settings → [your name] → Subscriptions) or Google " +
      "Play (Play Store → Menu → Subscriptions) account settings — we can't cancel it on your behalf. All purchases " +
      "are processed by Apple or Google; refunds follow their own policies, not ours.",
  },
  {
    heading: '3. Acceptable Use',
    body:
      'Use the app only for its intended personal purpose. Do not reverse-engineer, resell, or use the app to violate ' +
      'any applicable law.',
  },
  {
    heading: '4. Your Content',
    body:
      'Events, notes, photos, and messages you create are yours. Because the app is offline-first, you are solely ' +
      'responsible for backing up your own data (Settings → Data & Privacy → Export); your phone\'s own system ' +
      'backup can help, but isn\'t guaranteed to be on or up to date.',
  },
  {
    heading: '5. Intellectual Property',
    body:
      "The app's design, code, and branding belong to us (or our licensors). Nothing here transfers any of that to " +
      'you beyond the limited right to use the app as intended.',
  },
  {
    heading: '6. Disclaimer Of Warranties',
    body:
      'The app is provided "as is" and "as available," without warranties of any kind, to the maximum extent ' +
      "permitted by law. We don't guarantee the app will be uninterrupted or error-free, or that a reminder will " +
      "always fire exactly on time — your device operating system's own battery/notification limits can affect " +
      'delivery timing.',
  },
  {
    heading: '7. Limitation Of Liability',
    body:
      'To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages ' +
      'arising from your use of the app, including a missed event or reminder.',
  },
  {
    heading: '8. Termination',
    body:
      'We may suspend or discontinue the app, or any feature of it, at any time. You may stop using the app at any ' +
      'time by uninstalling it.',
  },
  {
    heading: '9. Changes To These Terms',
    body:
      'We may update these Terms as the app changes. Continued use of the app after an update means you accept the ' +
      'revised Terms.',
  },
  {
    heading: '10. Governing Law',
    body:
      'These Terms are governed by the laws applicable in your country of residence, without regard to ' +
      'conflict-of-laws rules.',
  },
  {
    heading: '11. Contact',
    body: 'Questions about these Terms? Email shookiapps@gmail.com.',
  },
];

// TODO before App Store/Google Play submission: have this reviewed by
// counsel — see docs/PROJECT.md §9's EULA requirement for auto-renewing
// subscriptions.
export default function TermsScreen() {
  const { colors, spacing, typography } = useTheme();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={[typography.caption, { color: colors.secondary, marginBottom: spacing.md }]}>Last updated: {LAST_UPDATED}</Text>
      <Text style={[typography.body, { color: colors.text, lineHeight: 24, marginBottom: spacing.lg }]}>
        Please read these Terms of Use (&ldquo;Terms&rdquo;) carefully before using PuraEvents (the &ldquo;app&rdquo;).
      </Text>
      {SECTIONS.map((section) => (
        <View key={section.heading} style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.bodyStrong, { color: colors.text, marginBottom: 6 }]}>{section.heading}</Text>
          <Text style={[typography.body, { color: colors.secondary, lineHeight: 22 }]}>{section.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
