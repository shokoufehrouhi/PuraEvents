import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../src/theme/PreferencesContext';

// Derived from Tabs' own `tabBar` prop type rather than importing
// BottomTabBarProps directly — @react-navigation/bottom-tabs isn't a
// resolvable package on its own here (expo-router vendors its types), so
// pulling the type this way avoids a broken import while still getting
// the real shape.
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ROUTE_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  index: { active: 'calendar', inactive: 'calendar-outline' },
  widgets: { active: 'grid', inactive: 'grid-outline' },
  settings: { active: 'settings', inactive: 'settings-outline' },
};

// A fully custom tab bar — not react-navigation's default renderer
// styled via tabBarIcon/tabBarStyle (tried first; hit real rendering
// bugs there — see below) but a small component this screen owns
// outright. Floating rounded bar, inset from the edges, with the active
// tab shown as its own solid circular bubble rather than a tinted icon +
// label — distinct from the flat edge-to-edge bar/tint-color pattern
// almost every stock app uses.
//
// Earlier attempts styled the *default* tab bar via tabBarIcon (a custom
// icon-wrapper View) and via tabBarActiveBackgroundColor +
// tabBarItemStyle — both intermittently broke (icons rendering invisible,
// then the active label disappearing with an unmargined pill), which
// traces back to react-navigation's own tab-item wrapper measuring that
// content for label positioning. Owning the whole bar here sidesteps that
// code path entirely — every View below is sized explicitly, nothing is
// sized purely from an as-yet-unmeasured icon glyph.
function CustomTabBar({ state, descriptors, navigation }: TabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 14) }]}>
      <View style={[styles.bar, { backgroundColor: colors.surface, shadowColor: '#000' }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = typeof options.title === 'string' ? options.title : route.name;
          const focused = state.index === index;
          const icon = ROUTE_ICONS[route.name] ?? ROUTE_ICONS.index;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <Pressable key={route.key} onPress={onPress} style={styles.item}>
              <View
                style={[
                  styles.bubble,
                  focused
                    ? { backgroundColor: colors.primary, shadowColor: colors.primary }
                    : { backgroundColor: 'transparent' },
                ]}
              >
                <Ionicons name={focused ? icon.active : icon.inactive} size={22} color={focused ? colors.onPrimary : colors.secondary} />
              </View>
              <Text
                style={[
                  styles.label,
                  { color: focused ? colors.primary : colors.secondary, fontWeight: focused ? '800' : '600' },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.events') }} />
      <Tabs.Screen name="widgets" options={{ title: t('tabs.widgets') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 10 },
  bar: {
    flexDirection: 'row',
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 6,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  bubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  label: { fontSize: 13 },
});
