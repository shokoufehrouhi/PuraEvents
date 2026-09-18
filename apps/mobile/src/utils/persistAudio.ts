// SDK 57's default expo-file-system export is the new File/Directory/Paths
// API; /legacy keeps the documentDirectory + copyAsync shape used here —
// same reasoning as persistImage.ts, which this file otherwise mirrors.
import * as FileSystem from 'expo-file-system/legacy';

const SOUNDS_DIR = 'event-sounds/';

// expo-audio's recorder writes into the app's own cache directory by
// default (see useAudioRecorder in components/VoiceRecorder.tsx) — iOS is
// free to reclaim that any time. Copy the finished recording into the
// permanent document directory instead, so it survives for the life of the
// install, not just until the next cache sweep.
//
// Returned/stored as a path *relative* to documentDirectory, not the full
// absolute file:// URI — same reinstall-survival reasoning as
// persistPickedImage in persistImage.ts.
export async function persistRecordedAudio(sourceUri: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}${SOUNDS_DIR}`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const relativePath = `${SOUNDS_DIR}${Date.now()}-${Math.random().toString(36).slice(2)}.m4a`;
  await FileSystem.copyAsync({ from: sourceUri, to: `${FileSystem.documentDirectory}${relativePath}` });
  return relativePath;
}

// Turns a stored relative path back into something useAudioPlayer (or
// react-native-share's base64 read, see event/[id]/index.tsx) can load
// right now — same relative-path resolution as resolvePhotoUri.
export function resolveAudioUri(uri: string | undefined): string | undefined {
  if (!uri) return uri;
  return `${FileSystem.documentDirectory}${uri}`;
}

// Best-effort — called when a recording is replaced/removed so the old
// file doesn't linger forever; a failure here (already gone, etc.) is
// harmless and shouldn't block whatever the caller is doing.
export async function deleteRecordedAudio(uri: string | undefined): Promise<void> {
  if (!uri) return;
  await FileSystem.deleteAsync(`${FileSystem.documentDirectory}${uri}`, { idempotent: true }).catch(() => {});
}
