import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { Image, Text, View } from 'react-native';

import { useTheme } from '../src/theme/PreferencesContext';

export default function AboutScreen() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', paddingTop: spacing.xxl }}>
      {/* The real app icon (see scripts/icon_from_artwork.py), already a
          rounded square with transparent corners. */}
      <Image source={require('../assets/images/app-logo.png')} style={{ width: 88, height: 88 }} />
      <Text style={[typography.headline, { color: colors.text, marginTop: spacing.md }]}>{t('appName')}</Text>
      <Text style={[typography.caption, { color: colors.secondary, marginTop: spacing.xs }]}>
        {t('settings.version')} {Constants.expoConfig?.version ?? '1.0.0'}
      </Text>
    </View>
  );
}
