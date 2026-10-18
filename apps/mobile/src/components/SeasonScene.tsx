import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

// A small landscape for the current season — blossom and drifting petals
// in spring, full green trees and rising light motes in summer, orange
// trees and tumbling leaves in autumn, snowy pines and falling snow in
// winter. Seasons turn on the astronomical dates (northern hemisphere),
// which is also when the Persian calendar's seasons begin. Static SVG for
// the scene; only the falling bits move, on the native driver.

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export function seasonOf(date: Date): Season {
  const m = date.getMonth(); // 0 = Jan
  const d = date.getDate();
  const md = m * 100 + d;
  if (md >= 220 && md < 521) return 'spring'; // 20 Mar – 20 Jun
  if (md >= 521 && md < 822) return 'summer'; // 21 Jun – 21 Sep
  if (md >= 822 && md < 1121) return 'autumn'; // 22 Sep – 20 Dec
  return 'winter';
}

interface Palette {
  sky: [string, string, string];
  sun: string;
  hills: [string, string, string];
  trunk: string;
  foliage: string[];
  particle: string[];
}

const PALETTES: Record<Season, Palette> = {
  spring: {
    sky: ['#A9C8F5', '#D9E4FA', '#FBE3EC'],
    sun: '#FFF3C4',
    hills: ['#B7D9A8', '#8FC47E', '#6BAA62'],
    trunk: '#7A5A4A',
    foliage: ['#F7B8CF', '#F49AB9', '#FBD3E2'],
    particle: ['#FFC4D8', '#FFD9E6', '#F7A9C4'],
  },
  summer: {
    sky: ['#3C8CE6', '#7DB8F2', '#CFE7FB'],
    sun: '#FFF0A8',
    hills: ['#8CC66A', '#5FA94A', '#3F8A3A'],
    trunk: '#6B4A33',
    foliage: ['#4E9E45', '#3D8A3C', '#66B356'],
    particle: ['#FFF6C8', '#FFFFFF', '#FFE98A'],
  },
  autumn: {
    sky: ['#F2A65E', '#F8C98E', '#FBE4C2'],
    sun: '#FFE0A0',
    hills: ['#D99A5B', '#B86F3E', '#8E4E2E'],
    trunk: '#5E3E2B',
    foliage: ['#E8743B', '#D9472B', '#F2B33D'],
    particle: ['#E8743B', '#D9472B', '#F2B33D', '#C9682E'],
  },
  winter: {
    sky: ['#6A84A8', '#A3B7D2', '#DCE6F2'],
    sun: '#F4F7FF',
    hills: ['#E8EEF6', '#D5E0EE', '#C3D2E6'],
    trunk: '#5A4A42',
    foliage: ['#2F5D50', '#2A5246', '#386B5C'],
    particle: ['#FFFFFF'],
  },
};

const rand = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function ridgePath(w: number, h: number, base: number, amp: number, seed: number): string {
  const steps = 12;
  const pts = Array.from({ length: steps + 1 }, (_, i) => [
    (i / steps) * w,
    base - amp * (0.6 * Math.sin(i * 0.8 + seed) + 0.4 * Math.sin(i * 1.9 + seed * 2.1)),
  ]);
  let d = `M0 ${h} L0 ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    d += ` Q${px} ${py} ${(px + x) / 2} ${(py + y) / 2}`;
  }
  return `${d} L${w} ${pts[pts.length - 1][1]} L${w} ${h} Z`;
}

function useLoop(duration: number, delay = 0): Animated.Value {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([Animated.delay(delay), Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, duration, v]);
  return v;
}

// ---- Trees ------------------------------------------------------------------

/** A round broadleaf tree: trunk and three overlapping canopy blobs. */
function RoundTree({ x, base, size, trunk, colors, seed }: { x: number; base: number; size: number; trunk: string; colors: string[]; seed: number }) {
  const c = (i: number) => colors[Math.floor(rand(seed + i) * colors.length)];
  return (
    <G>
      <Rect x={x - size * 0.06} y={base - size * 0.55} width={size * 0.12} height={size * 0.55} fill={trunk} rx={size * 0.03} />
      <Circle cx={x - size * 0.22} cy={base - size * 0.62} r={size * 0.28} fill={c(1)} />
      <Circle cx={x + size * 0.22} cy={base - size * 0.66} r={size * 0.27} fill={c(2)} />
      <Circle cx={x} cy={base - size * 0.86} r={size * 0.32} fill={c(3)} />
    </G>
  );
}

/** A pine with snow on each tier. */
function SnowyPine({ x, base, size, trunk, color }: { x: number; base: number; size: number; trunk: string; color: string }) {
  const tiers = [0, 1, 2];
  return (
    <G>
      <Rect x={x - size * 0.05} y={base - size * 0.2} width={size * 0.1} height={size * 0.2} fill={trunk} />
      {tiers.map((i) => {
        const top = base - size * (0.42 + i * 0.26);
        const half = size * (0.34 - i * 0.08);
        const bottom = top + size * 0.34;
        return (
          <G key={i}>
            <Path d={`M${x} ${top} L${x + half} ${bottom} L${x - half} ${bottom} Z`} fill={color} />
            <Path
              d={`M${x} ${top} L${x + half * 0.45} ${top + size * 0.15} Q${x} ${top + size * 0.11} ${x - half * 0.45} ${top + size * 0.15} Z`}
              fill="#FFFFFF"
              opacity={0.95}
            />
          </G>
        );
      })}
    </G>
  );
}

// ---- Falling / floating bits -------------------------------------------------

/** One particle: falls (or rises, in summer) across the card on a slow
 *  sway, turning as it goes. */
function Particle({ season, color, i, width, height }: { season: Season; color: string; i: number; width: number; height: number }) {
  const duration = (season === 'winter' ? 9000 : season === 'summer' ? 11_000 : 7500) + rand(i + 7) * 5000;
  const t = useLoop(duration, Math.round(rand(i + 3) * duration));
  const startX = rand(i + 11) * width;
  const drift = season === 'autumn' ? 50 : season === 'winter' ? 14 : 30;
  const rising = season === 'summer';
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: rising ? [height + 6, -10] : [-14, height + 10] });
  const translateX = t.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [startX, startX + drift, startX + drift * 0.3, startX + drift * 1.2, startX + drift * 0.6],
  });
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${season === 'autumn' ? 540 : 300}deg`] });
  const opacity = rising ? t.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.9, 0.9, 0] }) : 1;
  const size = season === 'winter' ? 3 + rand(i + 5) * 3 : season === 'summer' ? 2.5 + rand(i + 5) * 2 : 7 + rand(i + 5) * 4;

  let shape;
  if (season === 'autumn') {
    shape = (
      <Svg width={size * 1.4} height={size * 1.4} viewBox="0 0 20 20">
        <Path d="M10 1 C14 5 18 7 17 12 C16 16 12 18 10 19 C8 18 4 16 3 12 C2 7 6 5 10 1 Z" fill={color} />
        <Path d="M10 3 L10 19" stroke="rgba(90,40,20,0.45)" strokeWidth={1} />
      </Svg>
    );
  } else if (season === 'spring') {
    shape = (
      <Svg width={size} height={size * 0.7} viewBox="0 0 20 14">
        <Ellipse cx={10} cy={7} rx={9} ry={5.5} fill={color} />
      </Svg>
    );
  } else {
    shape = (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: season === 'summer' ? 0.9 : 0,
          shadowRadius: 4,
        }}
      />
    );
  }

  return (
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, opacity, transform: [{ translateX }, { translateY }, { rotate }] }}>
      {shape}
    </Animated.View>
  );
}

// ---- The scene -----------------------------------------------------------------

interface Props {
  /** For previews: draw this season instead of the current one. */
  season?: Season;
}

export function SeasonScene({ season: fixed }: Props) {
  const season = fixed ?? seasonOf(new Date());
  const p = PALETTES[season];
  const [{ width: W, height: H }, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  const scene = useMemo(() => {
    if (!W) return null;
    return {
      far: ridgePath(W, H, H * 0.7, H * 0.08, 2.2),
      mid: ridgePath(W, H, H * 0.8, H * 0.06, 5.3),
      near: ridgePath(W, H, H * 0.9, H * 0.04, 8.1),
    };
  }, [W, H]);

  const count = season === 'winter' ? 26 : season === 'summer' ? 14 : 16;

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {W > 0 && scene ? (
        <>
          <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="ssky" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={p.sky[0]} />
                <Stop offset="0.6" stopColor={p.sky[1]} />
                <Stop offset="1" stopColor={p.sky[2]} />
              </LinearGradient>
              <RadialGradient id="ssun" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={p.sun} stopOpacity={0.9} />
                <Stop offset="0.35" stopColor={p.sun} stopOpacity={0.35} />
                <Stop offset="1" stopColor={p.sun} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={W} height={H} fill="url(#ssky)" />
            {/* Between the title and the top-right repeat label. */}
            <Circle cx={W * 0.62} cy={H * 0.24} r={H * 0.3} fill="url(#ssun)" />
            <Circle cx={W * 0.62} cy={H * 0.24} r={H * 0.065} fill={p.sun} />

            <Path d={scene.far} fill={p.hills[0]} opacity={0.85} />
            <Path d={scene.mid} fill={p.hills[1]} />
            {season === 'winter'
              ? [0.74, 0.82, 0.89, 0.96].map((fx, i) => (
                  <SnowyPine key={i} x={W * fx} base={H * (0.84 + rand(i) * 0.03)} size={H * (0.3 + rand(i + 9) * 0.12)} trunk={p.trunk} color={p.foliage[i % p.foliage.length]} />
                ))
              : [0.75, 0.84, 0.93].map((fx, i) => (
                  <RoundTree key={i} x={W * fx} base={H * (0.86 + rand(i) * 0.03)} size={H * (0.3 + rand(i + 9) * 0.1)} trunk={p.trunk} colors={p.foliage} seed={i * 5 + 1} />
                ))}
            <Path d={scene.near} fill={p.hills[2]} />
            {season === 'summer' || season === 'spring'
              ? Array.from({ length: 18 }, (_, i) => (
                  <Circle
                    key={i}
                    cx={W * (0.45 + rand(i + 40) * 0.55)}
                    cy={H * (0.9 + rand(i + 60) * 0.08)}
                    r={1.6 + rand(i + 80)}
                    fill={season === 'summer' ? ['#FFE45C', '#FFFFFF', '#FF9DBA'][i % 3] : ['#FFFFFF', '#F7B8CF'][i % 2]}
                  />
                ))
              : null}
          </Svg>

          {Array.from({ length: count }, (_, i) => (
            <Particle key={i} season={season} color={p.particle[i % p.particle.length]} i={i} width={W} height={H} />
          ))}

          {/* Darkens toward the left, where the card's text sits. */}
          <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="swash" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#1A1230" stopOpacity={season === 'winter' || season === 'spring' ? 0.55 : 0.45} />
                <Stop offset="0.75" stopColor="#1A1230" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={W} height={H} fill="url(#swash)" />
          </Svg>
        </>
      ) : null}
    </View>
  );
}
