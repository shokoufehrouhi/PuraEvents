import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import { useTheme } from '../theme/PreferencesContext';

export type AddWidgetStepKind =
  | 'long-press-home'
  | 'tap-edit'
  | 'tap-plus'
  | 'tap-widgets-menu'
  | 'search'
  | 'choose-size'
  | 'drag-widget';

type Colors = ReturnType<typeof useTheme>['colors'];

// A tiny mock phone-screen frame every illustration below sits inside —
// just a rounded surface with a few faint squares standing in for other
// app icons, so each step reads as "this is happening on your Home
// Screen" without pretending to be an actual iOS/Android screenshot
// (which would drift out of sync the moment Apple/Google restyle their
// own system UI, and could never be pixel-accurate across every device
// size/OS version anyway).
function PhoneFrame({ children }: { children: React.ReactNode }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        width: 120,
        height: 84,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: colors.outline,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

function AppIconDots({ colors }: { colors: Colors }) {
  return (
    <View style={{ position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: colors.outline }} />
      ))}
    </View>
  );
}

// Soft breathing ring behind a "press and hold" fingertip — the only
// motion in these illustrations, and only on the two steps that actually
// teach a long-press (a static icon reads as a normal tap; "hold" is
// inherently a duration, not a pose, so it's the one gesture here a still
// image genuinely can't convey on its own).
function PulseRing({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.7, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.5, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, scale]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', width: 28, height: 28, borderRadius: 14, backgroundColor: color, opacity, transform: [{ scale }] }}
    />
  );
}

// One small schematic per step of the manual Add-to-Home-Screen walkthrough
// (add-widget-to-home.tsx) — Android's 3 steps and iOS's 5 share the two
// "long-press" kinds since both platforms start the same way.
export function AddWidgetStepIllustration({ kind }: { kind: AddWidgetStepKind }) {
  const { colors, radius } = useTheme();

  switch (kind) {
    case 'long-press-home':
      return (
        <PhoneFrame>
          <AppIconDots colors={colors} />
          <PulseRing color={colors.primary} />
          <Ionicons name="hand-left" size={22} color={colors.primary} />
        </PhoneFrame>
      );
    // iOS 26 renamed the old top-left "+" to "Edit" — jiggle mode now opens
    // a menu (Add Widget among its options) instead of jumping the user
    // straight into the widget gallery. Deliberately no AppIconDots
    // backdrop here (unlike the other jiggle-mode steps): the pill's own
    // top-left position inside the frame already reads as "that corner
    // button", and the real screen's jiggling icons aren't the point of
    // this particular step.
    case 'tap-edit':
      return (
        <PhoneFrame>
          <View
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: radius.pill,
              backgroundColor: colors.primary,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.onPrimary }}>Edit</Text>
          </View>
        </PhoneFrame>
      );
    case 'tap-plus':
      return (
        <PhoneFrame>
          <AppIconDots colors={colors} />
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={18} color={colors.onPrimary} />
          </View>
        </PhoneFrame>
      );
    case 'tap-widgets-menu':
      return (
        <PhoneFrame>
          <AppIconDots colors={colors} />
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: radius.pill,
              backgroundColor: colors.primary,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Ionicons name="apps" size={12} color={colors.onPrimary} />
            <Ionicons name="chevron-forward" size={10} color={colors.onPrimary} />
          </View>
        </PhoneFrame>
      );
    case 'search':
      return (
        <PhoneFrame>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: radius.pill,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.outline,
            }}
          >
            <Ionicons name="search" size={14} color={colors.secondary} />
            <View style={{ width: 56, height: 8, borderRadius: 4, backgroundColor: colors.primary, opacity: 0.35 }} />
          </View>
        </PhoneFrame>
      );
    case 'choose-size':
      return (
        <PhoneFrame>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: colors.outline }} />
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 5,
                borderWidth: 2,
                borderColor: colors.primary,
                backgroundColor: `${colors.primary}22`,
              }}
            />
            <View style={{ width: 34, height: 34, borderRadius: 6, backgroundColor: colors.outline }} />
          </View>
        </PhoneFrame>
      );
    case 'drag-widget':
      return (
        <PhoneFrame>
          <AppIconDots colors={colors} />
          <View style={{ width: 30, height: 20, borderRadius: 5, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="move" size={12} color={colors.onPrimary} />
          </View>
        </PhoneFrame>
      );
  }
}
