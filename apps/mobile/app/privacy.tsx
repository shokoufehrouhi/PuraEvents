import { ScrollView, Text, View } from 'react-native';

import { useTheme } from '../src/theme/PreferencesContext';

const LAST_UPDATED = 'October 16, 2026';

// English-only, deliberately — this is a legal document, not app UI copy,
// and machine-translating GDPR/CCPA/subscription language into the app's
// other 5 locales without native-speaker legal review risks getting the
// actual obligations wrong, which a mistranslated button label never does.
// Real-world apps commonly ship legal docs in one canonical language for
// exactly this reason.
const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: '1. Summary',
    body:
      'PuraEvents is offline-first: your events, reminders, and appearance settings are stored on this device, and ' +
      'no account is needed. We don\'t run our own servers or analytics; crash reports go to Sentry (section 4). The free version shows ' +
      'ads through Google AdMob, which collects some device data to do so (see section 4); PuraEvents Pro has no ' +
      'ads. Purchases are verified through RevenueCat.',
  },
  {
    heading: '2. Information Stored On Your Device',
    body:
      'Events you create (title, date/time, timezone, category, notes, reminders, appearance, and any optional Share ' +
      'message or sender name), widgets you design (photos and style settings), and app preferences (theme, language, ' +
      'calendar system) are stored locally on your device. It leaves your device only when you export it yourself (see ' +
      '"Your Choices" below), or through your phone\'s own backup: on Android, the system\'s Auto Backup saves the ' +
      'app\'s events and settings (not photos) to your own Google account, and on iPhone they are part of your ' +
      'iCloud device backup. Those backups are run by Google or Apple under your account and your phone\'s backup ' +
      'settings; we never receive them. Calendar sync (optional, Pro): with your permission the app reads events from ' +
      'the phone calendars you choose and writes your PuraEvents events to a separate "PuraEvents" calendar on the ' +
      'phone. This happens on the device only; whether those calendars sync to an online account is up to your ' +
      'calendar settings.',
  },
  {
    heading: '3. Photos You Add',
    body:
      "If you pick a photo from your device's photo library for a custom widget, the app copies it into its own local " +
      'storage so it keeps working after you close the picker. We never upload that photo anywhere.',
  },
  {
    heading: '4. Third-Party Services We Use',
    body:
      'Pexels API: the Events tab background photo and the Pro category-photo gallery are fetched from Pexels ' +
      "(pexels.com), using only a city name (derived from your device's timezone, not GPS — we never request " +
      "location access) or a category keyword as the search term. Notifications: reminders are scheduled locally " +
      "using your operating system's own notification system — we don't run a push server and never see or store " +
      'your reminder content remotely. App Store / Google Play: a Pro purchase is handled entirely by Apple or ' +
      "Google; we don't receive or store your payment card details. RevenueCat (revenuecat.com): checks whether you " +
      'have an active Pro purchase, using your store purchase receipts and a random app user ID it creates — not ' +
      'your name or email. Google AdMob (free version only): to show, measure, and limit ads and to prevent ad ' +
      'fraud, Google\'s Mobile Ads SDK collects your device\'s advertising ID, IP address, device and app ' +
      'information, and how you interact with ads. Depending on your region and settings these ads may be ' +
      'personalized. Google handles this data under its own policy: policies.google.com/technologies/partner-sites. ' +
      'Sentry (sentry.io, servers in the EU): when the app crashes or hits an error, a report with the technical ' +
      'details (which code failed, app version, phone model and OS version) is sent so we can fix it. It doesn\'t ' +
      'include your events, notes, or account details, and we don\'t send your IP address with it.',
  },
  {
    heading: '5. Data We Do Not Collect',
    body:
      'We don\'t run analytics, don\'t ask for your name, email, or location, and don\'t sell ' +
      'your personal data. The advertising data described in section 4 is collected by Google\'s SDK in the free ' +
      'version, not by us. If any of this changes, this policy — and your platform\'s privacy labels — will be ' +
      'updated first.',
  },
  {
    heading: '6. Your Choices',
    body:
      'Export: Settings → Data & Privacy → Export shares all of your events as a file at any time. Delete: since your ' +
      'data lives on this device, clearing the app\'s data or uninstalling it deletes it there; copies in your phone\'s ' +
      'own Google or iCloud backup are managed (and can be deleted) in that account\'s backup settings. ' +
      'Access/correction: view and edit every event directly in the app at any time. Ads: you can reset or delete ' +
      'your advertising ID, or opt out of personalized ads, in your phone\'s settings (Android: Settings → Google ' +
      '→ Ads, or Privacy → Ads; iPhone: Settings → Privacy & Security → Tracking). Upgrading to Pro removes ads.',
  },
  {
    heading: "7. Children's Privacy",
    body:
      "PuraEvents isn't directed at children under 13 (or the minimum age required in your country), and we don't " +
      'knowingly collect personal information from children.',
  },
  {
    heading: '8. International Users (GDPR / CCPA)',
    body:
      "Your events stay on your device, and we don't process your personal data on servers of our own. The services " +
      'in section 4 (Google AdMob, RevenueCat, Sentry, Pexels, and Apple/Google for purchases) process the limited data ' +
      'described there. If you\'re in the EU/UK or California and have questions about your rights under GDPR or ' +
      'the CCPA, contact us using the details below.',
  },
  {
    heading: '9. Changes To This Policy',
    body:
      "We may update this policy as the app changes — for example when cloud sync, analytics, or new subscription " +
      'products are added. We\'ll update the date above and, for material changes, note it in the app\'s release notes.',
  },
  {
    heading: '10. Contact',
    body: 'Questions about this policy? Email shookiapps@gmail.com.',
  },
];

// TODO before App Store/Google Play submission: have this reviewed by
// counsel, confirm the contact address is live, and fill in a governing
// jurisdiction if one gets added here later (see terms.tsx's own note).
export default function PrivacyScreen() {
  const { colors, spacing, typography } = useTheme();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={[typography.caption, { color: colors.secondary, marginBottom: spacing.md }]}>Last updated: {LAST_UPDATED}</Text>
      <Text style={[typography.body, { color: colors.text, lineHeight: 24, marginBottom: spacing.lg }]}>
        This Privacy Policy explains what information PuraEvents (&ldquo;the app&rdquo;, &ldquo;we&rdquo;) handles and how.
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
