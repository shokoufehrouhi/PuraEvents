import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, useColorScheme, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Image as SvgImage, Polygon, RadialGradient, Stop } from 'react-native-svg';

import { SPLASH_BACKGROUND } from './AppSplash';

const LOGO = require('../../assets/images/app-logo.png');

// Same violet as the theme's primary (theme/tokens.ts) — this overlay sits
// outside PreferencesProvider, so it can't read the theme.
const PRIMARY = '#6558D9';
const TEXT = { light: '#14142B', dark: '#F5F5FA' };

const NAME = 'PuraEvents';
const SIZE = 140;
const GRID = 3;

type Point = [number, number];

// Fixed offsets for the four interior vertices, so the mesh looks hand-cut
// instead of like a plain grid. The outer vertices stay put and the mesh
// keeps the logo's square outline.
const JITTER: Point[] = [
  [0.05, -0.04],
  [-0.04, 0.05],
  [-0.05, 0.04],
  [0.04, -0.05],
];

function vertex(row: number, col: number): Point {
  let x = col / GRID;
  let y = row / GRID;
  if (row > 0 && row < GRID && col > 0 && col < GRID) {
    const [jx, jy] = JITTER[(row - 1) * (GRID - 1) + (col - 1)];
    x += jx;
    y += jy;
  }
  return [x * SIZE, y * SIZE];
}

const TRIANGLES: Point[][] = [];
for (let row = 0; row < GRID; row++) {
  for (let col = 0; col < GRID; col++) {
    const a = vertex(row, col);
    const b = vertex(row, col + 1);
    const c = vertex(row + 1, col + 1);
    const d = vertex(row + 1, col);
    // Alternate the diagonal so the cuts don't all lean the same way.
    if ((row + col) % 2 === 0) TRIANGLES.push([a, b, c], [a, c, d]);
    else TRIANGLES.push([a, b, d], [b, c, d]);
  }
}

// Each shard is the real logo clipped to one triangle, drawn in a view as
// small as its triangle, then flown in from outside along the line from the
// logo's center through the triangle's own center.
const SHARDS = TRIANGLES.map((points, i) => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const pad = 1;
  const minX = Math.floor(Math.min(...xs)) - pad;
  const minY = Math.floor(Math.min(...ys)) - pad;
  const w = Math.ceil(Math.max(...xs)) + pad - minX;
  const h = Math.ceil(Math.max(...ys)) + pad - minY;
  const dx = (xs[0] + xs[1] + xs[2]) / 3 - SIZE / 2;
  const dy = (ys[0] + ys[1] + ys[2]) / 3 - SIZE / 2;
  const length = Math.hypot(dx, dy) || 1;
  const distance = 110 + ((i * 37) % 70);
  return {
    minX,
    minY,
    w,
    h,
    polygon: points.map((p) => p.join(',')).join(' '),
    fromX: (dx / length) * distance,
    fromY: (dy / length) * distance,
    spin: ((i * 53) % 140) - 70,
  };
});

/** The splash's reveal animation: a faint wireframe of the logo, then the
 *  logo assembled from shards flying in, a small pulse, and the app name
 *  typed out. Plays over the app once it's ready (see app/_layout.tsx) and
 *  calls onFinish when it has faded out. Tap skips; with the system's
 *  "remove animations" setting it doesn't play at all. */
export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const dark = useColorScheme() === 'dark';
  const [progress] = useState(() => SHARDS.map(() => new Animated.Value(0)));
  const [wireframe] = useState(() => new Animated.Value(0));
  const [assembled] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  const [exit] = useState(() => new Animated.Value(1));
  // -1 = not started (no cursor yet), then the number of letters typed.
  const [typed, setTyped] = useState(-1);
  const [cursorOn, setCursorOn] = useState(true);
  const finishRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let finished = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];

    finishRef.current = () => {
      if (finished || cancelled) return;
      finished = true;
      Animated.timing(exit, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => onFinish());
    };

    function play() {
      Animated.timing(wireframe, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      Animated.parallel(
        progress.map((value, i) =>
          Animated.timing(value, {
            toValue: 1,
            duration: 620,
            delay: 150 + i * 35,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          })
        )
      ).start();
      // Once the last shard has landed, the whole logo fades in over them to
      // hide the hairline seams between the clipped triangles.
      Animated.sequence([
        Animated.delay(1350),
        Animated.parallel([
          Animated.timing(assembled, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.timing(wireframe, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]),
        Animated.timing(pulse, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]).start();

      timers.push(
        setTimeout(() => {
          setTyped(0);
          let letters = 0;
          intervals.push(
            setInterval(() => {
              letters += 1;
              setTyped(letters);
              if (letters === NAME.length) {
                intervals.forEach(clearInterval);
                intervals.length = 0;
                intervals.push(setInterval(() => setCursorOn((on) => !on), 320));
                timers.push(setTimeout(() => finishRef.current(), 450));
              }
            }, 55)
          );
        }, 1500)
      );
    }

    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) onFinish();
        else play();
      });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      intervals.forEach(clearInterval);
    };
    // The animated values and onFinish are stable for the splash's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stroke = dark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(101, 88, 217, 0.4)';
  const textColor = dark ? TEXT.dark : TEXT.light;
  const shownName = typed >= 0 ? NAME.slice(0, typed) : '';

  return (
    <Animated.View
      onTouchStart={() => finishRef.current()}
      style={[styles.root, { backgroundColor: dark ? SPLASH_BACKGROUND.dark : SPLASH_BACKGROUND.light, opacity: exit }]}
    >
      <View style={styles.logoBox}>
        <Animated.View pointerEvents="none" style={[styles.glow, { opacity: assembled, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }] }]}>
          <Svg width={340} height={340}>
            <Defs>
              <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={PRIMARY} stopOpacity={dark ? 0.45 : 0.3} />
                <Stop offset="1" stopColor={PRIMARY} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={170} cy={170} r={170} fill="url(#glow)" />
          </Svg>
        </Animated.View>

        <Animated.View style={{ width: SIZE, height: SIZE, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }] }}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: wireframe }]}>
            <Svg width={SIZE} height={SIZE}>
              {SHARDS.map((shard, i) => (
                <Polygon key={i} points={shard.polygon} fill="none" stroke={stroke} strokeWidth={1} />
              ))}
            </Svg>
          </Animated.View>

          {SHARDS.map((shard, i) => {
            const p = progress[i];
            return (
              <Animated.View
                key={i}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: shard.minX,
                  top: shard.minY,
                  width: shard.w,
                  height: shard.h,
                  opacity: p.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] }),
                  transform: [
                    { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [shard.fromX, 0] }) },
                    { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [shard.fromY, 0] }) },
                    { rotate: p.interpolate({ inputRange: [0, 1], outputRange: [`${shard.spin}deg`, '0deg'] }) },
                    { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
                  ],
                }}
              >
                <Svg width={shard.w} height={shard.h} viewBox={`${shard.minX} ${shard.minY} ${shard.w} ${shard.h}`}>
                  <Defs>
                    <ClipPath id={`shard${i}`}>
                      <Polygon points={shard.polygon} />
                    </ClipPath>
                  </Defs>
                  <SvgImage href={LOGO} x={0} y={0} width={SIZE} height={SIZE} preserveAspectRatio="none" clipPath={`url(#shard${i})`} />
                </Svg>
              </Animated.View>
            );
          })}

          <Animated.Image source={LOGO} style={{ position: 'absolute', top: 0, left: 0, width: SIZE, height: SIZE, opacity: assembled }} />
        </Animated.View>
      </View>

      {/* An invisible copy of the full name sizes the line, and the typed
          part is laid over it from the left — so the line keeps its final
          width and the text doesn't shift sideways as it grows. (Nested
          Text with a transparent color isn't reliable on Android.) */}
      <View pointerEvents="none" style={styles.nameRow}>
        <View>
          <Text style={[styles.name, { opacity: 0 }]}>{NAME}</Text>
          <Text style={[styles.name, styles.typed, { color: textColor }]}>
            {shownName}
            {typed >= 0 && cursorOn ? <Text style={{ color: PRIMARY }}>|</Text> : null}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  logoBox: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 340, height: 340 },
  // Pinned below the logo's fixed center, so the logo sits at the exact
  // middle of the screen (where the native splash's logo is) and the name
  // is centered under it.
  nameRow: { position: 'absolute', left: 0, right: 0, top: '50%', marginTop: SIZE / 2 + 40, alignItems: 'center' },
  name: { fontSize: 32, fontWeight: '800', letterSpacing: 0.5 },
  typed: { position: 'absolute', left: 0, top: 0 },
});
