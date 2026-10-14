import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppAlertModal, type AppAlertState } from '../src/components/AppAlertModal';
import { HeroCountdown } from '../src/components/HeroCountdown';
import { FREE_LIMITS, hasFreeTrial, isStoreAvailable, loadProOffering, purchasePro, restorePro } from '../src/subscription';
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

const PLAN_IDS: PlanId[] = ['monthly', 'yearly', 'lifetime'];

// PROJECT.md §6.4's list prices — only shown until the real, localized
// store prices arrive from RevenueCat (or if the store can't be reached,
// in which case Continue reports that instead of buying anything).
const FALLBACK_PRICES: Record<PlanId, string> = { monthly: '$2.99', yearly: '$14.99', lifetime: '$29.99' };
const FALLBACK_YEARLY_SUB = '$1.25/mo\nSave 58%';

// PuraEvents Pro comparison + purchase screen. Deliberately fits one
// screen with no scrolling — every row/tile below is sized to add up
// within a standard device height, not left to a ScrollView to sort out.
// Purchases go through RevenueCat (see src/subscription) against the
// dashboard's "current" offering.
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
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  // App-styled result popup instead of Alert.alert; `leave` closes the
  // paywall once the user dismisses a success message.
  const [alert, setAlert] = useState<(AppAlertState & { leave?: boolean }) | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadProOffering().then((result) => {
      if (!cancelled) setOffering(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const packages: Record<PlanId, PurchasesPackage | null> = {
    monthly: offering?.monthly ?? null,
    yearly: offering?.annual ?? null,
    lifetime: offering?.lifetime ?? null,
  };
  const priceFor = (id: PlanId) => packages[id]?.product.priceString ?? FALLBACK_PRICES[id];
  // Before the offering loads, assume PROJECT.md §6.3's setup (trial on
  // the subscriptions, never on Lifetime); after, trust what the store
  // actually has configured.
  const trialAvailableFor = (id: PlanId) => (offering ? hasFreeTrial(packages[id]) : id !== 'lifetime');
  const anyTrial = PLAN_IDS.some(trialAvailableFor);

  const yearlyProduct = packages.yearly?.product;
  const monthlyProduct = packages.monthly?.product;
  const yearlySub =
    yearlyProduct && monthlyProduct
      ? [
          yearlyProduct.pricePerMonthString ? `${yearlyProduct.pricePerMonthString}/mo` : null,
          `Save ${Math.round((1 - yearlyProduct.price / (monthlyProduct.price * 12)) * 100)}%`,
        ]
          .filter(Boolean)
          // Two lines, not one joined by ' · ' — localized prices like
          // "TRY74.16/mo" are too wide for one line in a third-width tile.
          .join('\n')
      : FALLBACK_YEARLY_SUB;

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

  const selectedPrice = priceFor(plan);
  // "$2.99/ month" / "$14.99/ year" / "$29.99 once" — matches this same
  // screen's own pre-existing perMonth/perYear concatenation convention,
  // just also covering the one-time Lifetime case those two don't.
  const priceLine =
    plan === 'monthly'
      ? `${selectedPrice}${t('paywall.perMonth')}`
      : plan === 'yearly'
        ? `${selectedPrice}${t('paywall.perYear')}`
        : `${selectedPrice} ${t('paywall.once')}`;
  const footerText = trial ? t('paywall.trialThen', { priceLine }) : t('paywall.chargeNow', { priceLine });
  const continueLabel = trial ? t('paywall.startTrial') : t('paywall.continue');

  function showStoreUnavailable() {
    setAlert({ title: t('paywall.storeUnavailableTitle'), message: t('paywall.storeUnavailableMessage'), variant: 'warning' });
  }

  async function handleContinue() {
    const pkg = packages[plan];
    if (!pkg) {
      showStoreUnavailable();
      return;
    }
    setBusy('purchase');
    try {
      const outcome = await purchasePro(pkg, { withTrial: trial });
      if (outcome === 'purchased') {
        setAlert({ title: t('paywall.purchaseSuccessTitle'), message: t('paywall.purchaseSuccessMessage'), variant: 'success', leave: true });
      }
    } catch (e) {
      setAlert({ title: t('paywall.purchaseErrorTitle'), message: (e as Error).message, variant: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function handleRestore() {
    if (!isStoreAvailable()) {
      showStoreUnavailable();
      return;
    }
    setBusy('restore');
    try {
      const restored = await restorePro();
      if (restored) {
        setAlert({ title: t('paywall.restoreSuccessTitle'), message: t('paywall.restoreSuccessMessage'), variant: 'success', leave: true });
      } else {
        setAlert({ title: t('paywall.restoreNoneTitle'), message: t('paywall.restoreNoneMessage'), variant: 'warning' });
      }
    } catch (e) {
      setAlert({ title: t('paywall.purchaseErrorTitle'), message: (e as Error).message, variant: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
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
          {PLAN_IDS.map((id) => {
            const selected = plan === id;
            // A plan without a trial (always Lifetime — a one-time purchase
            // has no "after the trial" plan to convert into) isn't a choice
            // while trial is on, not just quietly auto-switched away from.
            const disabled = trial && !trialAvailableFor(id);
            const sub = id === 'yearly' ? yearlySub : undefined;
            return (
              <Pressable
                key={id}
                onPress={() => !disabled && setPlan(id)}
                style={[
                  styles.planTile,
                  { borderColor: selected ? colors.primary : colors.outline, backgroundColor: colors.surface, opacity: disabled ? 0.4 : 1 },
                ]}
              >
                {id === 'yearly' ? (
                  <View style={[styles.bestBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.bestBadgeText}>{t('paywall.bestValue')}</Text>
                  </View>
                ) : null}
                <Text style={[styles.planLabel, { color: colors.text }]}>{t(`paywall.${id}`)}</Text>
                <Text style={[styles.planPrice, { color: colors.text }]}>{priceFor(id)}</Text>
                {sub ? (
                  <Text style={[styles.planSub, { color: colors.secondary }]} numberOfLines={2}>
                    {sub}
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

        {/* Hidden (not disabled) when the store has no trial configured on
            any plan — an always-off toggle would just be noise. */}
        {anyTrial ? (
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
                if (v && !trialAvailableFor(plan)) setPlan(trialAvailableFor('yearly') ? 'yearly' : 'monthly');
              }}
              trackColor={{ true: colors.primary }}
            />
          </View>
        ) : null}

        <Pressable
          onPress={handleContinue}
          disabled={busy !== null}
          style={[styles.continueBtn, { backgroundColor: colors.primary, opacity: busy === 'restore' ? 0.6 : 1 }]}
        >
          {busy === 'purchase' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.continueText}>{continueLabel}</Text>}
        </Pressable>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.maybeLater}>
          <Text style={[styles.maybeLaterText, { color: colors.secondary }]}>{t('paywall.maybeLater')}</Text>
        </Pressable>

        <Text style={[styles.footerNote, { color: colors.secondary }]}>{footerText}</Text>

        <View style={styles.linksRow}>
          <Text style={[styles.linkText, { color: colors.primary }]} onPress={busy ? undefined : handleRestore}>
            {t('paywall.restorePurchases')}
          </Text>
          <Text style={{ color: colors.secondary }}>|</Text>
          <Text style={[styles.linkText, { color: colors.primary }]} onPress={() => router.push('/terms')}>
            {t('paywall.terms')}
          </Text>
          <Text style={{ color: colors.secondary }}>|</Text>
          <Text style={[styles.linkText, { color: colors.primary }]} onPress={() => router.push('/privacy')}>
            {t('paywall.privacyLink')}
          </Text>
        </View>
      </View>
      <AppAlertModal
        alert={alert}
        onClose={() => {
          const leave = alert?.leave;
          setAlert(null);
          if (leave) router.back();
        }}
      />
    </>
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
  planSub: { fontSize: 10, marginTop: 2, textAlign: 'center' },
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
