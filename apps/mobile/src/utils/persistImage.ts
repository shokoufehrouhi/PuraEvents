// SDK 57's default expo-file-system export is the new File/Directory/Paths
// API; /legacy keeps the documentDirectory + copyAsync shape used here.
import * as FileSystem from 'expo-file-system/legacy';

const PHOTOS_DIR = 'widget-photos/';

// expo-image-picker's own result URI lives under the app's OS-purgeable
// Caches directory — iOS is free to reclaim it any time. Copy the picked
// file into the permanent document directory instead, so it survives for
// the life of the install, not just until the next cache sweep.
//
// Returned/stored as a path *relative* to documentDirectory (e.g.
// "widget-photos/xxx.jpg"), not the full absolute file:// URI — that
// absolute URI bakes in the current install's container UUID, and a
// rebuild/reinstall assigns a new one. Xcode/simctl actually migrates the
// Documents folder's contents to the new container on reinstall, so the
// file itself survives; only the stored absolute path goes stale. A
// relative path re-resolved against *today's* documentDirectory (see
// resolvePhotoUri below) survives that migration instead of silently
// turning into a broken image.
export async function persistPickedImage(sourceUri: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}${PHOTOS_DIR}`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const ext = sourceUri.split('.').pop()?.split('?')[0] || 'jpg';
  const relativePath = `${PHOTOS_DIR}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: `${FileSystem.documentDirectory}${relativePath}` });
  return relativePath;
}

// Turns a stored photo reference back into something <Image>/<ImageBackground>
// can load right now. Handles every shape customPhotoUri/Widget.photoUri
// has ever been saved as:
//  - a relative path (current format, see persistPickedImage above) —
//    resolved against today's documentDirectory.
//  - a remote http(s) URL (a Categories photo, or persistRemoteImage's own
//    download-failed fallback) — returned untouched, it's not a local file.
//  - a legacy absolute file:// URI from before this fix, possibly baked
//    with a *previous* install's container UUID — re-resolved the same
//    way as a relative path (by keeping only what comes after "Documents/")
//    so it keeps working across a reinstall instead of needing every
//    already-saved photo to be re-picked.
export function resolvePhotoUri(uri: string | undefined): string | undefined {
  if (!uri) return uri;
  if (/^https?:\/\//.test(uri)) return uri;
  const marker = '/Documents/';
  const markerIndex = uri.indexOf(marker);
  const relativePath = uri.startsWith('file://') && markerIndex !== -1 ? uri.slice(markerIndex + marker.length) : uri;
  return `${FileSystem.documentDirectory}${relativePath}`;
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
    const dir = `${FileSystem.documentDirectory}${PHOTOS_DIR}`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const ext = sourceUrl.split('.').pop()?.split('?')[0] || 'jpg';
    const relativePath = `${PHOTOS_DIR}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    // Same relative-path reasoning as persistPickedImage above — store what
    // survives a reinstall, not today's absolute container path.
    await FileSystem.downloadAsync(sourceUrl, `${FileSystem.documentDirectory}${relativePath}`);
    return relativePath;
  } catch {
    return sourceUrl;
  }
}
