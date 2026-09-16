import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { resolvePhotoUri } from '../utils/persistImage';

// The real home-screen widget's container is small (a single fixed Small
// size, see androidWidgetTask.tsx), so anything wider than this is detail
// the widget could never actually show — and a RemoteViews/Binder
// transaction has roughly a 1MB budget
// across everything in one update, which an unresized camera photo (often
// several MB) blows through on its own.
const MAX_WIDTH = 320;

// Turns a locally-stored custom photo (see persistImage.ts's own relative-
// path convention) into a data: URI — the only form of *local* image
// react-native-android-widget's ImageWidget actually accepts (its
// ImageWidgetSource type is require()/http(s)/data:image only, no
// file://), resized down first for the transaction-size reason above.
// Returns null on any failure (missing file, decode error, ...) — the
// caller falls back to the flat accent-gradient look the same way
// MiniWidget's own onError handling does for a broken photo.
export async function preparePhotoDataUri(relativePath: string | undefined): Promise<string | null> {
  if (!relativePath) return null;
  const resolved = resolvePhotoUri(relativePath);
  if (!resolved) return null;
  try {
    const image = await ImageManipulator.manipulate(resolved).resize({ width: MAX_WIDTH }).renderAsync();
    const result = await image.saveAsync({ base64: true, compress: 0.6, format: SaveFormat.JPEG });
    return result.base64 ? `data:image/jpeg;base64,${result.base64}` : null;
  } catch {
    return null;
  }
}
