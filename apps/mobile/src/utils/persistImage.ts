// SDK 57's default expo-file-system export is the new File/Directory/Paths
// API; /legacy keeps the documentDirectory + copyAsync shape used here.
import * as FileSystem from 'expo-file-system/legacy';

// expo-image-picker's own result URI lives under the app's OS-purgeable
// Caches directory — iOS is free to reclaim it any time, and a rebuild/
// reinstall (new app container) wipes it outright, silently turning any
// already-saved customPhotoUri into a broken image. Copy the picked file
// into the permanent document directory instead, so it survives for the
// life of the install, not just until the next cache sweep.
export async function persistPickedImage(sourceUri: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}widget-photos/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const ext = sourceUri.split('.').pop()?.split('?')[0] || 'jpg';
  const destUri = `${dir}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  return destUri;
}

// A Categories photo (see categoryPhoto.ts) is a remote Pexels URL, not a
// local file — copyAsync above can't touch it. Download it into the same
// permanent directory instead, so an event that picked one keeps showing
// it even after tomorrow's daily cache rotation drops that photo from the
// Categories tab entirely (see getCategoryPhotos), or Pexels itself ever
// takes it down. Falls back to the original remote URL on any failure
// (offline, etc.) rather than throwing — MiniWidget's own onError handling
// still covers that case gracefully.
export async function persistRemoteImage(sourceUrl: string): Promise<string> {
  try {
    const dir = `${FileSystem.documentDirectory}widget-photos/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const ext = sourceUrl.split('.').pop()?.split('?')[0] || 'jpg';
    const destUri = `${dir}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const result = await FileSystem.downloadAsync(sourceUrl, destUri);
    return result.uri;
  } catch {
    return sourceUrl;
  }
}
