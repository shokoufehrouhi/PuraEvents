import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeroCountdown } from '../src/components/HeroCountdown';
import { FREE_LIMITS } from '../src/subscription';
import { useTheme } from '../src/theme/PreferencesContext';
import { fetchLocationPhotoUrl, getLocalPlaceName } from '../src/utils/locationPhoto';
import { PRESET_REMINDER_OFFSETS } from '../src/utils/reminders';

// Same local fallback the Events tab's own photo banner uses when a Pexels
// fetch fails (offline, no key, filtered network) — see EventHeroCard.
const FALLBACK_IMAGE = require('../assets/images/hero-fallback.png');

// A curated set of real IANA city zones — reuses the exact same "photo of
// a place" mechanism the Events tab's hero banner uses for the *user's
// own* city (see locationPhoto.ts), just pointed at a random *other* city
// each time this screen mounts. Purely a glossy "imagine your next trip"
// mockup, not tied to anything the user actually created.
const SAMPLE_TRIP_ZONES = [
  'Asia/Tokyo',
  'Europe/Paris',
  'America/New_York',
  'Europe/Rome',
  'Asia/Dubai',
  'Australia/Sydney',
  'Europe/London',
  'Asia/Singapore',
];

// Fixed offset — this is a mockup countdown, not a real event, so only the
// city/photo needs to feel fresh on every visit, not the numbers too.
const PREVIEW_TARGET_ISO = new Date(Date.now() + 18 * 86400000 + 6 * 3600000 + 24 * 60000).toISOString();

type PlanId = 'monthly' | 'yearly' | 'lifetime';

const PLANS: { id: PlanId; price: string; sub?: string }[] = [
  { id: 'monthly', price: '$2.99' },
  { id: 'yearly', price: '$14.99', sub: '$1.25/mo · Save 58%' },
  { id: 'lifetime', price: '$29.99' },
];

// PuraEvents Pro comparison + purchase screen. Deliberately fits one
// screen with no scrolling — every row/tile below is sized to add up
// within a standard device height, not left to a ScrollView to sort out.
// RevenueCat isn't wired yet (Phase 3, docs/PROJECT.md §5.1/§9) —
// Continue/trial toggle are real, honest placeholders.
export default function UpgradeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [plan, setPlan] = useState<PlanId>('yearly');
  // Off by default — a trial is opt-in, not a default state the user has
  // to notice and turn off. Turning it on picks the plan it converts to
  // after the 7 days (Lifetime doesn't apply — a one-time purchase has
  // nothing to "convert" into — so it's excluded below, with an
  // auto-switch off it if it was already selected).
  const [trial, setTrial] = useState(false);
  // Picked once per mount, not per render — a fresh city each time this
  // screen is opened, but stable while it's on screen.
  const [zone] = useState(() => SAMPLE_TRIP_ZONES[Math.floor(Math.random() * SAMPLE_TRIP_ZONES.length)]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const cityName = getLocalPlaceName(zone);

  useEffect(() => {
    let cancelled = false;
    fetchLocationPhotoUrl(zone).then((url) => {
      if (!cancelled) setPhotoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [zone]);

  // Lifetime is a one-time purchase — there's no "after the trial" plan
  // for it to convert into, so flipping the trial toggle on steers away
  // from it right there in the handler below (not a useEffect — this is
  // a direct response to the toggle event, not state to keep synced).

  const rows: [string, string, string][] = [
    [t('compare.activeEvents'), String(FREE_LIMITS.maxActiveEvents), t('compare.unlimited')],
    [t('compare.customWidgets'), String(FREE_LIMITS.maxWidgets), t('compare.unlimited')],
    [t('compare.categoryWidgets'), '—', t('compare.allWidgets')],
    [t('compare.reminders'), String(FREE_LIMITS.maxRemindersPerEvent), String(PRESET_REMINDER_OFFSETS.length)],
    [t('compare.cloudSync'), '—', '✓'],
    [t('compare.sharedEvents'), '—', '✓'],
    [t('compare.ads'), t('compare.yes'), t('compare.no')],
  ];

  const selectedPlan = PLANS.find((p) => p.id === plan)!;
  // "$2.99/ month" / "$14.99/ year" / "$29.99 once" — matches this same
  // screen's own pre-existing perMonth/perYear concatenation convention,
  // just also covering the one-time Lifetime case those two don't.
  const priceLine =
    plan === 'monthly'
      ? `${selectedPlan.price}${t('paywall.perMonth')}`
      : plan === 'yearly'
        ? `${selectedPlan.price}${t('paywall.perYear')}`
        : `${selectedPlan.price} ${t('paywall.once')}`;
  const footerText = trial ? t('paywall.trialThen', { priceLine }) : t('paywall.chargeNow', { priceLine });
  const continueLabel = trial ? t('paywall.startTrial') : t('paywall.continue');

  function handleContinue() {
    // Real, honest placeholder (see the file-level comment) — the copy
    // already reflects what would actually happen once RevenueCat is
    // wired up: a trial charges nothing today, a direct purchase does.
    const message = trial
      ? `Free trial starts today, no charge. You'll be billed ${priceLine} after 7 days unless you cancel first.`
      : `You'll be charged ${priceLine} today.`;
    Alert.alert('Not wired up yet', `${message} (Purchases go live once RevenueCat is integrated — Phase 3.)`);
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingBottom: insets.bottom + 10 }]}>
      <View style={styles.heroRow}>
        <View style={[styles.heroCard, { borderRadius: 18, backgroundColor: colors.surface }]}>
          <Image source={photoUrl ? { uri: photoUrl } : FALLBACK_IMAGE} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={[StyleSheet.absoluteFill, styles.heroScrim]} />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle} numberOfLines={1}>
              {t('compare.tripTitle', { city: cityName })}
            </Text>
            <HeroCountdown
              targetISO={PREVIEW_TARGET_ISO}
              textColor="#FFFFFF"
              labelColor="rgba(255,255,255,0.75)"
              numberSize={22}
              labelSize={9}
              compact
            />
          </View>
        </View>
        <View style={styles.heroSubtitleWrap}>
          <Text style={[styles.heroSubtitleLine1, { color: colors.text }]}>{t('compare.subtitleLine1')}</Text>
          <Text style={[styles.heroSubtitleLine2, { color: colors.primary }]}>{t('compare.subtitleLine2')}</Text>
        </View>
      </View>

      <View style={[styles.table, { backgroundColor: colors.surface, borderColor: colors.outline }]}>
        <View style={styles.compareHeaderRow}>
          <Text style={{ flex: 1.4 }} />
          <Text style={[styles.headerCell, { color: colors.secondary }]}>{t('compare.free')}</Text>
          <Text style={[styles.headerCell, { color: colors.primary }]}>{t('compare.pro')}</Text>
        </View>
        {rows.map(([label, free, pro], i) => (
          <View
            key={label}
            style={[styles.compareRow, { borderColor: colors.outline, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth }]}
          >
            <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
              {label}
            </Text>
            <Text style={[styles.rowValue, { color: colors.secondary }]} numberOfLines={2}>
              {free}
            </Text>
            <Text style={[styles.rowValue, { color: colors.primary, fontWeight: '700' }]} numberOfLines={2}>
              {pro}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.plans}>
        {PLANS.map((p) => {
          const selected = plan === p.id;
          // See the trial useEffect above — Lifetime has no "after the
          // trial" plan to convert into, so it's not a choice while trial
          // is on, not just quietly auto-switched away from.
          const disabled = trial && p.id === 'lifetime';
          return (
            <Pressable
              key={p.id}
              onPress={() => !disabled && setPlan(p.id)}
              style={[
                styles.planTile,
                { borderColor: selected ? colors.primary : colors.outline, backgroundColor: colors.surface, opacity: disabled ? 0.4 : 1 },
              ]}
            >
              {p.id === 'yearly' ? (
                <View style={[styles.bestBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.bestBadgeText}>{t('paywall.bestValue')}</Text>
                </View>
              ) : null}
              <Text style={[styles.planLabel, { color: colors.text }]}>{t(`paywall.${p.id}`)}</Text>
              <Text style={[styles.planPrice, { color: colors.text }]}>{p.price}</Text>
              {p.sub ? (
                <Text style={[styles.planSub, { color: colors.secondary }]} numberOfLines={1}>
                  {p.sub}
                </Text>
              ) : null}
              {/* Always rendered, not just when selected — an appearing/
                  disappearing element here would grow/shrink whichever
                  tile is tapped, throwing the row's equal heights off.
                  Reserving the same slot on all three and just toggling
                  its fill keeps every tile the same size regardless of
                  selection. */}
              <View style={[styles.planCheck, { backgroundColor: selected ? colors.primary : 'transparent' }]}>
                {selected ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.trialRow, { backgroundColor: colors.surface, borderColor: colors.outline }]}>
        <Ionicons name="gift-outline" size={20} color={colors.primary} />
        <View style={styles.trialText}>
          <Text style={[styles.trialLabel, { color: colors.text }]}>{t('paywall.startTrial')}</Text>
          <Text style={[styles.trialSub, { color: colors.secondary }]}>{t('paywall.noChargeToday')}</Text>
        </View>
        <Switch
          value={trial}
          onValueChange={(v) => {
            setTrial(v);
            if (v && plan === 'lifetime') setPlan('yearly');
          }}
          trackColor={{ true: colors.primary }}
        />
      </View>

      <Pressable onPress={handleContinue} style={[styles.continueBtn, { backgroundColor: colors.primary }]}>
        <Text style={styles.continueText}>{continueLabel}</Text>
      </Pressable>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.maybeLater}>
        <Text style={[styles.maybeLaterText, { color: colors.secondary }]}>{t('paywall.maybeLater')}</Text>
      </Pressable>

      <Text style={[styles.footerNote, { color: colors.secondary }]}>{footerText}</Text>

      <View style={styles.linksRow}>
        <Text style={[styles.linkText, { color: colors.primary }]} onPress={handleContinue}>
          {t('paywall.restorePurchases')}
        </Text>
        <Text style={{ color: colors.secondary }}>|</Text>
        <Text style={[styles.linkText, { color: colors.primary }]} onPress={() => Linking.openURL('https://example.com/terms')}>
          {t('paywall.terms')}
        </Text>
        <Text style={{ color: colors.secondary }}>|</Text>
        <Text style={[styles.linkText, { color: colors.primary }]} onPress={() => router.push('/privacy')}>
          {t('paywall.privacyLink')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16, paddingTop: 14, justifyContent: 'space-between' },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroCard: { width: 190, height: 118, overflow: 'hidden' },
  heroScrim: { backgroundColor: 'rgba(0,0,0,0.42)' },
  heroContent: { flex: 1, justifyContent: 'space-between', padding: 10 },
  heroTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  // Fixed, narrow width (not flex: 1) — forces the wrap onto short lines
  // like the reference mockup instead of stretching across all the
  // remaining row width next to the hero card.
  heroSubtitleWrap: { width: 158, marginLeft: 12 },
  heroSubtitleLine1: { fontSize: 18, fontWeight: '700', lineHeight: 23, textAlign: 'center' },
  heroSubtitleLine2: { fontSize: 19, fontWeight: '800', lineHeight: 23, marginTop: 2, textAlign: 'center' },
  table: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  compareHeaderRow: { flexDirection: 'row', marginBottom: 2 },
  headerCell: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  compareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  rowLabel: { flex: 1.4, fontSize: 13, fontWeight: '500' },
  rowValue: { flex: 1, textAlign: 'center', fontSize: 12.5 },
  plans: { flexDirection: 'row', gap: 8 },
  planTile: { flex: 1, borderWidth: 2, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' },
  bestBadge: { position: 'absolute', top: -9, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  bestBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  planLabel: { fontSize: 13, fontWeight: '700' },
  planPrice: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  planSub: { fontSize: 10, marginTop: 2 },
  planCheck: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  trialRow: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10 },
  trialText: { flex: 1, marginLeft: 10 },
  trialLabel: { fontSize: 13, fontWeight: '700' },
  trialSub: { fontSize: 11, marginTop: 1 },
  continueBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  continueText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  maybeLater: { paddingVertical: 4 },
  maybeLaterText: { textAlign: 'center', fontSize: 13, fontWeight: '600' },
  footerNote: { textAlign: 'center', fontSize: 11 },
  linksRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  linkText: { fontSize: 12, fontWeight: '600' },
});
