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
