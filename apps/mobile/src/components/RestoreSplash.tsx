import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, useColorScheme, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { SPLASH_BACKGROUND } from './AppSplash';

// Same violet as the theme's primary (theme/tokens.ts) — this screen shows
// outside PreferencesProvider, so it can't read the theme.
const PRIMARY = '#6558D9';
const LOGO = require('../../assets/images/app-logo.png');

const LOGO_SIZE = 120;
const RING = 208;
const STROKE = 6;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The splash with a circular progress ring around the logo, shown while a
 *  Google Drive restore downloads and applies the backup. `progress` is
 *  0–1; the ring eases to it and keeps turning slowly, so it still looks
 *  alive while one big file downloads. `transparent` drops the background so
 *  the screen can sit blurred behind it (see BackupBlurOverlay). */
export function RestoreSplash({ progress, transparent = false }: { progress: number; transparent?: boolean }) {
  const dark = useColorScheme() === 'dark';
  const [arc] = useState(() => new Animated.Value(0));
  const [turn] = useState(() => new Animated.Value(0));
  const [fadeIn] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
    // The animated values are stable for the screen's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Never fully empty: a sliver of arc shows right from the start.
    const target = Math.min(1, Math.max(0.04, progress));
    Animated.timing(arc, { toValue: target, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [progress, arc]);

  return (
    <View style={[styles.root, { backgroundColor: transparent ? 'transparent' : dark ? SPLASH_BACKGROUND.dark : SPLASH_BACKGROUND.light }]}>
      <Animated.View style={[styles.ring, { opacity: fadeIn, transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
        <Svg width={RING} height={RING}>
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            stroke={dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(101, 88, 217, 0.15)'}
            strokeWidth={STROKE}
            fill="none"
          />
          <AnimatedCircle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            stroke={PRIMARY}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={arc.interpolate({ inputRange: [0, 1], outputRange: [CIRCUMFERENCE, 0] })}
            rotation={-90}
            origin={`${RING / 2}, ${RING / 2}`}
          />
        </Svg>
      </Animated.View>
      <Animated.Image source={LOGO} style={{ width: LOGO_SIZE, height: LOGO_SIZE, opacity: fadeIn }} />
    </View>
  );
}

/** After a restore the app reloads. This carries the restore screen over
 *  the reloaded app — ring full, the app already mounting underneath with
 *  the restored data — then fades out to reveal it, so there's no plain
 *  splash before or after. */
export function RestoreReveal({ onFinish }: { onFinish: () => void }) {
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => onFinish());
    }, 900);
    return () => clearTimeout(timer);
    // The animated value and onFinish are stable for the screen's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View pointerEvents="auto" style={[StyleSheet.absoluteFill, { opacity }]}>
      <RestoreSplash progress={1} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: RING, height: RING },
});
