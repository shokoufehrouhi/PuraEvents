import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  targetISO: string;
  textColor?: string;
  labelColor?: string;
  // Overrides for spots that want a smaller countdown than the default
  // (e.g. Preferences' compact Preview card) without shrinking every other
  // hero card that shares this component (Events tab, event detail, wizard
  // preview) — leave unset for the standard size.
  numberSize?: number;
  labelSize?: number;
  // Thin vertical rule between columns (event detail's bordered countdown
  // card) — off by default so every other spot is unaffected.
  dividerColor?: string;
}

// Big three-column D/H/M countdown used on hero cards (event list + detail),
// matching the approved mockups. Ticks once a minute — the seconds-level
// CountdownText component is used in tighter row layouts instead.
export function HeroCountdown({
  targetISO,
  textColor = '#fff',
  labelColor = 'rgba(255,255,255,0.75)',
  numberSize = 44,
  labelSize = 12,
  dividerColor,
}: Props) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => dayjs());

  useEffect(() => {
    const interval = setInterval(() => setNow(dayjs()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const diffSeconds = Math.max(0, dayjs(targetISO).diff(now, 'second'));
  const days = Math.floor(diffSeconds / 86400);
  const hours = Math.floor((diffSeconds % 86400) / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);

  if (diffSeconds <= 0) {
    return <Text style={[styles.past, { color: textColor }]}>{t('countdown.past')}</Text>;
  }

  const columns: [number, string][] = [
    [days, 'DAYS'],
    [hours, 'HRS'],
    [minutes, 'MIN'],
  ];

  return (
    <View style={styles.row}>
      {columns.map(([value, label], i) => (
        <View key={label} style={styles.colWrap}>
          {i > 0 && dividerColor ? (
            <View style={[styles.divider, { backgroundColor: dividerColor, height: numberSize }]} />
          ) : null}
          <View style={styles.col}>
            <Text style={[styles.number, { color: textColor, fontSize: numberSize, lineHeight: numberSize + 4 }]}>{value}</Text>
            <Text style={[styles.label, { color: labelColor, fontSize: labelSize }]}>{label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 22 },
  colWrap: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  col: { alignItems: 'center' },
  divider: { width: 1 },
  number: { fontWeight: '900', fontVariant: ['tabular-nums'] },
  label: { fontWeight: '800', letterSpacing: 0.5, marginTop: 2 },
  past: { fontSize: 20, fontWeight: '700' },
});
