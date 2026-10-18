import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

// A sky that follows the real time of day, for the "Today" hero banner:
// pre-dawn indigo, a pink-orange sunrise, day blue, a violet-orange sunset
// and a deep navy night. Layered hills with a small skyline sit along the
// bottom (windows lit after dark); the sun or moon rides an arc with a
// radial glow, clouds drift, stars twinkle with the odd shooting star, and
// birds cross by day. The sky and hills are static SVG redrawn once a
// minute; only small Views move, on the native driver.

type RGB = [number, number, number];

// Sky gradient (top, middle, horizon) at given hours; blended in between so
// the sky shifts minute by minute.
const KEYFRAMES: { hour: number; top: RGB; mid: RGB; low: RGB }[] = [
  { hour: 0, top: [10, 12, 38], mid: [26, 26, 70], low: [52, 44, 104] },
  { hour: 4.5, top: [18, 20, 58], mid: [40, 38, 100], low: [86, 66, 140] },
  { hour: 6, top: [70, 70, 160], mid: [170, 120, 190], low: [255, 160, 120] },
  { hour: 7.5, top: [96, 150, 235], mid: [170, 190, 240], low: [255, 214, 170] },
  { hour: 10, top: [52, 126, 226], mid: [110, 170, 240], low: [190, 222, 252] },
  { hour: 15, top: [60, 132, 228], mid: [120, 176, 240], low: [200, 224, 250] },
  { hour: 17.5, top: [84, 110, 210], mid: [190, 150, 200], low: [255, 176, 120] },
  { hour: 19, top: [56, 46, 140], mid: [170, 84, 150], low: [255, 128, 96] },
  { hour: 20.5, top: [22, 22, 66], mid: [56, 44, 112], low: [120, 70, 130] },
  { hour: 24, top: [10, 12, 38], mid: [26, 26, 70], low: [52, 44, 104] },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c: RGB, alpha = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;

function skyAt(hour: number): { top: RGB; mid: RGB; low: RGB } {
  const i = KEYFRAMES.findIndex((k) => k.hour > hour);
  const a = KEYFRAMES[Math.max(0, i - 1)];
  const b = KEYFRAMES[i] ?? a;
  const t = b.hour === a.hour ? 0 : (hour - a.hour) / (b.hour - a.hour);
  return { top: mixRGB(a.top, b.top, t), mid: mixRGB(a.mid, b.mid, t), low: mixRGB(a.low, b.low, t) };
}

const isNight = (hour: number) => hour < 5.5 || hour >= 20;
/** 0 at full day, 1 at full night, eased through dawn and dusk. */
function darkness(hour: number): number {
  if (hour >= 7.5 && hour <= 17.5) return 0;
  if (hour >= 20.5 || hour <= 4.5) return 1;
  if (hour < 7.5) return 1 - (hour - 4.5) / 3;
  return (hour - 17.5) / 3;
}

/** Fractional local hour, refreshed every minute. */
function useHour(fixedHour?: number): number {
  const read = () => {
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  };
  const [hour, setHour] = useState(read);
  useEffect(() => {
    if (fixedHour !== undefined) return;
    const id = setInterval(() => setHour(read()), 60_000);
    return () => clearInterval(id);
  }, [fixedHour]);
  return fixedHour ?? hour;
}

/** A looping 0→1 value. */
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

// Deterministic pseudo-random in [0, 1).
const rand = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** A smooth ridge line across the width (a few summed sines), closed down
 *  to the bottom edge. */
function ridgePath(w: number, h: number, base: number, amp: number, seed: number): string {
  const steps = 14;
  const pts = Array.from({ length: steps + 1 }, (_, i) => {
    const x = (i / steps) * w;
    const y = base - amp * (0.55 * Math.sin(i * 0.9 + seed) + 0.3 * Math.sin(i * 2.1 + seed * 2.3) + 0.15 * Math.sin(i * 4.7 + seed * 5.1));
    return [x, y];
  });
  let d = `M0 ${h} L0 ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    d += ` Q${px} ${py} ${(px + x) / 2} ${(py + y) / 2}`;
  }
  return `${d} L${w} ${pts[pts.length - 1][1]} L${w} ${h} Z`;
}

/** A small skyline of flat-roofed buildings standing on the middle hills,
 *  in the right-hand third — clear of the banner's title and date line. */
function skyline(w: number, groundY: number) {
  const buildings: { x: number; y: number; bw: number; bh: number; seed: number }[] = [];
  let x = w * 0.7;
  let i = 0;
  while (x < w * 0.95) {
    const bw = 8 + rand(i) * 12;
    const bh = 14 + rand(i + 50) * 30;
    buildings.push({ x, y: groundY - bh, bw, bh, seed: i });
    x += bw + 1 + rand(i + 99) * 3;
    i++;
  }
  return buildings;
}

// ---- Moving pieces ----------------------------------------------------------

const STARS = Array.from({ length: 34 }, (_, i) => ({
  x: rand(i + 1),
  y: rand(i + 101) * 0.6,
  size: 1 + rand(i + 201) * (i % 7 === 0 ? 2.6 : 1.4),
  delay: Math.round(rand(i + 301) * 3500),
  bright: i % 7 === 0,
}));

function Star({ x, y, size, delay, bright, width, height }: (typeof STARS)[number] & { width: number; height: number }) {
  const [opacity] = useState(() => new Animated.Value(0.35));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, opacity]);
  const halo = bright ? size * 4 : size;
  return (
    <Animated.View style={{ position: 'absolute', left: x * width - halo / 2, top: y * height - halo / 2, width: halo, height: halo, opacity }}>
      {bright ? <View style={[StyleSheet.absoluteFill, { borderRadius: halo / 2, backgroundColor: 'rgba(200,210,255,0.18)' }]} /> : null}
      <View
        style={{
          position: 'absolute',
          left: halo / 2 - size / 2,
          top: halo / 2 - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bright ? '#FFFFFF' : '#E6E9FF',
        }}
      />
    </Animated.View>
  );
}

/** Every ~11 s a faint streak crosses the upper sky. */
function ShootingStar({ width, height }: { width: number; height: number }) {
  const t = useLoop(1100, 10_000);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [width * 0.15, width * 0.6] });
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [height * 0.05, height * 0.3] });
  const opacity = t.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 0.8, 0] });
  return (
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, opacity, transform: [{ translateX }, { translateY }, { rotate: '32deg' }] }}>
      <Svg width={70} height={3}>
        <Defs>
          <LinearGradient id="streak" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.95} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0.5} width={70} height={2} rx={1} fill="url(#streak)" />
      </Svg>
    </Animated.View>
  );
}

const CLOUD_PATH = 'M14 38 C2 38 0 24 12 22 C12 10 28 6 34 16 C40 2 62 2 66 18 C76 10 92 16 90 28 C100 28 102 38 92 38 Z';

/** A soft cloud with a top-lit gradient that takes the horizon's colour
 *  underneath; drifts right and re-enters on the left. */
function Cloud(props: { top: number; scale: number; duration: number; offset: number; width: number; light: string; shade: string; id: string }) {
  const { top, scale, duration, offset, width, light, shade, id } = props;
  const x = useLoop(duration);
  const w = 104 * scale;
  const translateX = Animated.modulo(Animated.add(x, offset), 1).interpolate({ inputRange: [0, 1], outputRange: [-w - 10, width + 10] });
  return (
    <Animated.View style={{ position: 'absolute', top, left: 0, transform: [{ translateX }] }}>
      <Svg width={w} height={42 * scale} viewBox="0 0 104 42">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={light} />
            <Stop offset="1" stopColor={shade} />
          </LinearGradient>
        </Defs>
        <Path d={CLOUD_PATH} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** Slowly turning soft rays behind a low sun (dawn, dusk). */
function SunRays({ size, color }: { size: number; color: string }) {
  const t = useLoop(90_000);
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const r = size / 2;
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const a1 = a - 0.06;
    const a2 = a + 0.06;
    return `M${r} ${r} L${r + Math.cos(a1) * r} ${r + Math.sin(a1) * r} L${r + Math.cos(a2) * r} ${r + Math.sin(a2) * r} Z`;
  });
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="rays" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {rays.map((d, i) => (
          <Path key={i} d={d} fill="url(#rays)" />
        ))}
      </Svg>
    </Animated.View>
  );
}

/** Three distant birds crossing every ~28 s by day. */
function Birds({ width, height, color }: { width: number; height: number; color: string }) {
  const t = useLoop(16_000, 12_000);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [width + 20, -60] });
  const translateY = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [height * 0.32, height * 0.26, height * 0.3] });
  const flap = useLoop(700);
  const scaleY = flap.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.55, 1] });
  return (
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, transform: [{ translateX }, { translateY }] }}>
      {[
        [0, 0],
        [16, 7],
        [30, 2],
      ].map(([bx, by], i) => (
        <Animated.View key={i} style={{ position: 'absolute', left: bx, top: by, transform: [{ scaleY }] }}>
          <Svg width={12} height={6}>
            <Path d="M0 5 Q3 0 6 4 Q9 0 12 5" stroke={color} strokeWidth={1.4} fill="none" strokeLinecap="round" />
          </Svg>
        </Animated.View>
      ))}
    </Animated.View>
  );
}

// ---- The sky ----------------------------------------------------------------

interface Props {
  /** For previews: draw the sky at this hour instead of now. */
  hour?: number;
}

export function LivingSky({ hour: fixedHour }: Props) {
  const hour = useHour(fixedHour);
  const [{ width: W, height: H }, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  const sky = useMemo(() => skyAt(hour), [hour]);
  const dark = darkness(hour);
  const night = isNight(hour);
  const lowSun = !night && (hour < 8 || hour > 17);

  // Sun (6–19.5 h) or moon on an arc over the right half — the banner's
  // text sits on the left.
  const nightHour = hour < 12 ? hour + 24 : hour;
  const progress = night ? Math.min(1, Math.max(0, (nightHour - 20) / 9.5)) : Math.min(1, Math.max(0, (hour - 6) / 13.5));
  const orb = night ? 22 : 30;
  const orbX = W * (0.56 + progress * 0.32);
  const orbY = H * (0.5 - Math.sin(progress * Math.PI) * 0.32);
  const sunCore = lowSun ? '#FFD39A' : '#FFF6D2';
  const sunGlow = lowSun ? '#FFAA70' : '#FFEFB0';

  // Hills: far ones take the horizon colour (haze), near ones go dark.
  const ink: RGB = [16, 14, 40];
  const farHill = mixRGB(sky.low, mixRGB(sky.mid, ink, 0.35), 0.55 + dark * 0.2);
  const midHill = mixRGB(sky.low, ink, 0.58 + dark * 0.2);
  const nearHill = mixRGB(sky.mid, ink, 0.78 + dark * 0.12);
  const windowLight = dark > 0.35;

  const landscape = useMemo(() => {
    if (!W) return null;
    const groundMid = H * 0.82;
    return {
      far: ridgePath(W, H, H * 0.74, H * 0.1, 1.3),
      mid: ridgePath(W, H, groundMid, H * 0.06, 4.1),
      near: ridgePath(W, H, H * 0.93, H * 0.05, 7.7),
      buildings: skyline(W, groundMid + H * 0.02),
    };
  }, [W, H]);

  const cloudLight = night ? css(mixRGB(sky.mid, [255, 255, 255], 0.18), 0.35) : css(mixRGB(sky.low, [255, 255, 255], 0.75), 0.9);
  const cloudShade = night ? css(sky.mid, 0.2) : css(mixRGB(sky.low, sky.mid, 0.4), lowSun ? 0.85 : 0.55);

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {W > 0 && landscape ? (
        <>
          <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={css(sky.top)} />
                <Stop offset="0.55" stopColor={css(sky.mid)} />
                <Stop offset="0.85" stopColor={css(sky.low)} />
              </LinearGradient>
              <RadialGradient id="orbGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={night ? '#DCDFFF' : sunGlow} stopOpacity={night ? 0.35 : 0.65} />
                <Stop offset="0.4" stopColor={night ? '#B8BCFF' : sunGlow} stopOpacity={night ? 0.12 : 0.25} />
                <Stop offset="1" stopColor={night ? '#B8BCFF' : sunGlow} stopOpacity={0} />
              </RadialGradient>
              <RadialGradient id="horizonGlow" cx="75%" cy="100%" r="80%">
                <Stop offset="0" stopColor={css(sky.low)} stopOpacity={0.9} />
                <Stop offset="1" stopColor={css(sky.low)} stopOpacity={0} />
              </RadialGradient>
              <RadialGradient id="moon" cx="40%" cy="35%" r="70%">
                <Stop offset="0" stopColor="#FFFFFF" />
                <Stop offset="1" stopColor="#D9DBF2" />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={W} height={H} fill="url(#sky)" />
            <Rect x={0} y={H * 0.3} width={W} height={H * 0.7} fill="url(#horizonGlow)" />
            <Circle cx={orbX} cy={orbY} r={orb * (night ? 3 : 4)} fill="url(#orbGlow)" />
            {night ? (
              <G>
                <Circle cx={orbX} cy={orbY} r={orb / 2} fill="url(#moon)" />
                <Circle cx={orbX - orb * 0.14} cy={orbY - orb * 0.08} r={orb * 0.09} fill="#C9CCE6" opacity={0.7} />
                <Circle cx={orbX + orb * 0.16} cy={orbY + orb * 0.12} r={orb * 0.06} fill="#C9CCE6" opacity={0.6} />
                <Circle cx={orbX + orb * 0.05} cy={orbY - orb * 0.22} r={orb * 0.04} fill="#C9CCE6" opacity={0.6} />
              </G>
            ) : (
              <Circle cx={orbX} cy={orbY} r={orb / 2} fill={sunCore} />
            )}
          </Svg>

          {dark > 0.5 ? STARS.map((s, i) => <Star key={i} {...s} width={W} height={H} />) : null}
          {night ? <ShootingStar width={W} height={H} /> : null}
          {lowSun ? (
            <View style={{ position: 'absolute', left: orbX - H * 0.9, top: orbY - H * 0.9 }}>
              <SunRays size={H * 1.8} color={sunGlow} />
            </View>
          ) : null}

          <Cloud id="c1" top={H * 0.1} scale={1} duration={80_000} offset={0.15} width={W} light={cloudLight} shade={cloudShade} />
          <Cloud id="c2" top={H * 0.36} scale={0.7} duration={105_000} offset={0.62} width={W} light={cloudLight} shade={cloudShade} />
          <Cloud id="c3" top={H * 0.22} scale={1.25} duration={130_000} offset={0.4} width={W} light={cloudLight} shade={cloudShade} />
          {!night && !lowSun ? <Birds width={W} height={H} color={css(mixRGB(sky.top, ink, 0.6), 0.8)} /> : null}

          <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
            <Path d={landscape.far} fill={css(farHill)} opacity={0.75} />
            <G>
              {landscape.buildings.map((b) => (
                <G key={b.seed}>
                  <Rect x={b.x} y={b.y} width={b.bw} height={b.bh + H * 0.1} fill={css(midHill)} />
                  {windowLight
                    ? Array.from({ length: Math.floor(b.bh / 7) }, (_, row) =>
                        Array.from({ length: Math.max(1, Math.floor(b.bw / 5)) }, (_, col) =>
                          rand(b.seed * 31 + row * 7 + col) > 0.55 ? (
                            <Rect
                              key={`${row}-${col}`}
                              x={b.x + 2 + col * 4.5}
                              y={b.y + 3 + row * 6.5}
                              width={2}
                              height={2.4}
                              fill="#FFD98A"
                              opacity={0.55 + rand(b.seed + row + col) * 0.4}
                            />
                          ) : null,
                        ),
                      )
                    : null}
                </G>
              ))}
            </G>
            <Path d={landscape.mid} fill={css(midHill)} />
            <Path d={landscape.near} fill={css(nearHill)} />
          </Svg>

          {/* Darkens toward the left, where the banner's text sits. */}
          <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="wash" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#0E0B26" stopOpacity={0.32} />
                <Stop offset="0.6" stopColor="#0E0B26" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={W} height={H} fill="url(#wash)" />
          </Svg>
        </>
      ) : null}
    </View>
  );
}
