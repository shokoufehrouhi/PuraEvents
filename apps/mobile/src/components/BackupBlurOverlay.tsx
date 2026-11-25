import { BlurView } from 'expo-blur';
import type { RefObject } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';

import { RestoreSplash } from './RestoreSplash';

/** Shown over Data & Privacy while a Google Drive backup or restore runs: the
 *  screen stays visible but blurred, with the logo and progress ring on top
 *  — the restore screen's look, minus its solid background. `blurTarget` is
 *  the BlurTargetView wrapping the screen (Android blurs only what's inside
 *  it); `progress` is 0–1. */
export function BackupBlurOverlay({ blurTarget, progress }: { blurTarget: RefObject<View | null>; progress: number }) {
  const dark = useColorScheme() === 'dark';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <BlurView
        blurTarget={blurTarget}
        blurMethod="dimezisBlurViewSdk31Plus"
        // On Android the tint is a flat colour layer whose strength grows with
        // `intensity`, and the blur radius is intensity / blurReductionFactor.
        // Settings screens are light with white cards, so a strong blur flattens
        // everything into one white sheet; this keeps it light enough that the
        // menu underneath stays recognisable, just soft.
        tint={dark ? 'dark' : 'default'}
        intensity={30}
        blurReductionFactor={4}
        style={StyleSheet.absoluteFill}
      />
      {/* A soft dim, so the screen reads as blurred rather than washed out, and the logo stands out. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(30, 25, 70, 0.1)' }]} />
      <RestoreSplash progress={progress} transparent />
    </View>
  );
}
