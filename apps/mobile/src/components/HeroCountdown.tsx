import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  targetISO: string;
  textColor?: string;
  labelColor?: string;
}

// Big three-column D/H/M countdown used on hero cards (event list + detail),
// matching the approved mockups. Ticks once a minute — the seconds-level
// CountdownText component is used in tighter row layouts instead.
export function HeroCountdown({ targetISO, textColor = '#fff', labelColor = 'rgba(255,255,255,0.75)' }: Props) {
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
      {columns.map(([value, label]) => (
        <View key={label} style={styles.col}>
          <Text style={[styles.number, { color: textColor }]}>{value}</Text>
          <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 22 },
  col: { alignItems: 'center' },
  number: { fontSize: 50, fontWeight: '900', fontVariant: ['tabular-nums'], lineHeight: 54 },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginTop: 2 },
  past: { fontSize: 20, fontWeight: '700' },
});
