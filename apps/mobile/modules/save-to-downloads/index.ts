import { requireNativeModule } from 'expo';

// Android-only local module (see android/…/SaveToDownloadsModule.kt).
// Resolves to the file name actually used in Downloads.
const SaveToDownloads = requireNativeModule<{
  saveAsync(sourceUri: string, fileName: string, mimeType: string): Promise<string>;
}>('SaveToDownloads');

export function saveToDownloads(sourceUri: string, fileName: string, mimeType: string): Promise<string> {
  return SaveToDownloads.saveAsync(sourceUri, fileName, mimeType);
}
