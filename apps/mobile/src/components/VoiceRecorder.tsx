import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/PreferencesContext';
import { deleteRecordedAudio, persistRecordedAudio, resolveAudioUri } from '../utils/persistAudio';

function formatSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface Props {
  /** Relative path (see persistAudio.ts), same storage shape as PurEvent's
   *  own customVoiceUri — undefined means no recording yet. */
  uri: string | undefined;
  onChange: (uri: string | undefined) => void;
}

// Record/playback control for the Share step's optional voice message (see
// EventWizard.tsx) — sent alongside the ShareCard graphic when the user
// shares this event (event/[id]/index.tsx's handleShare), not played
// anywhere else in the app. Owns its own recorder for the whole component's
// life; the *player* (PlaybackRow below) remounts on every new uri instead,
// since expo-audio's useAudioPlayer loads its source once at creation and
// has no documented way to swap it later.
export function VoiceRecorder({ uri, onChange }: Props) {
  const { t } = useTranslation();
  const { colors, radius, typography } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [busy, setBusy] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  async function startRecording() {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setPermissionDenied(true);
      return;
    }
    setPermissionDenied(false);
    // iOS-only (Android has no such gate) — recorder.record() otherwise
    // throws RecordingDisabledException even with the mic permission
    // already granted; the OS audio session itself also needs switching
    // into record mode first (caught live on a real device, see
    // AudioRecorder.swift's own error). playsInSilentMode must be passed
    // together with allowsRecording:true, not left at its false default —
    // iOS rejects that combination outright (also caught live, see
    // AudioUtils.swift's own error) since a recording session is
    // necessarily an "interrupt silent mode" session on iOS.
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function stopRecording() {
    await recorder.stop();
    // Back to plain playback mode — see the allowsRecording comment above;
    // also routes future playback through the speaker again instead of
    // the earpiece (iOS ties that routing to allowsRecording too).
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (!recorder.uri) return;
    setBusy(true);
    try {
      // Replace, not accumulate — a re-record drops the previous file
      // instead of leaving it orphaned in documentDirectory forever.
      await deleteRecordedAudio(uri);
      onChange(await persistRecordedAudio(recorder.uri));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    deleteRecordedAudio(uri);
    onChange(undefined);
  }

  return (
    <View>
      <Text style={[typography.label, { color: colors.secondary, marginBottom: 4 }]}>{t('events.voiceLabel')}</Text>
      <Text style={[typography.caption, { color: colors.secondary, marginBottom: 8 }]}>{t('events.voiceHint')}</Text>

      {uri && !recorderState.isRecording ? (
        <PlaybackRow key={uri} uri={uri} busy={busy} onReRecord={startRecording} onDelete={remove} />
      ) : (
        <Pressable
          onPress={recorderState.isRecording ? stopRecording : startRecording}
          disabled={busy}
          style={[styles.row, { borderColor: colors.outline, borderRadius: radius.md, opacity: busy ? 0.6 : 1 }]}
        >
          <Ionicons
            name={recorderState.isRecording ? 'stop-circle' : 'mic-outline'}
            size={20}
            color={recorderState.isRecording ? colors.danger : colors.secondary}
          />
          <Text style={[typography.body, { color: colors.text, flex: 1, marginLeft: 10 }]}>
            {recorderState.isRecording ? formatSeconds(recorderState.durationMillis / 1000) : t('events.voiceRecord')}
          </Text>
        </Pressable>
      )}

      {permissionDenied ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: 8 }]}>{t('events.voicePermissionMessage')}</Text>
      ) : null}
    </View>
  );
}

// A fresh player per uri (see the `key={uri}` above) — expo-audio's
// useAudioPlayer only loads its `source` once, at creation.
function PlaybackRow({
  uri,
  busy,
  onReRecord,
  onDelete,
}: {
  uri: string;
  busy: boolean;
  onReRecord: () => void;
  onDelete: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const player = useAudioPlayer(resolveAudioUri(uri));
  const status = useAudioPlayerStatus(player);

  async function togglePlayback() {
    if (status.playing) {
      player.pause();
      return;
    }
    // A finished playback leaves currentTime at duration — seek back to
    // the start so a second tap replays instead of doing nothing.
    if (status.didJustFinish || status.currentTime >= status.duration) await player.seekTo(0);
    player.play();
  }

  return (
    <View style={[styles.row, { borderColor: colors.outline, borderRadius: radius.md }]}>
      <Pressable onPress={togglePlayback} hitSlop={8}>
        <Ionicons name={status.playing ? 'pause-circle' : 'play-circle'} size={24} color={colors.primary} />
      </Pressable>
      <Text style={[typography.body, { color: colors.text, flex: 1, marginLeft: 10 }]}>
        {formatSeconds(status.playing ? status.duration - status.currentTime : status.duration)}
      </Text>
      <Pressable onPress={onReRecord} disabled={busy} hitSlop={8} style={{ marginRight: spacing.md }}>
        <Ionicons name="refresh" size={20} color={colors.secondary} />
      </Pressable>
      <Pressable onPress={onDelete} disabled={busy} hitSlop={8}>
        <Ionicons name="trash-outline" size={20} color={colors.danger} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12 },
});
