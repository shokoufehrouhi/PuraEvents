import { requireNativeModule } from 'expo';

// Android-only local module (see android/…/SaveToDownloadsModule.kt).
// Resolves to the file name actually used in Downloads.
const SaveToDownloads = requireNativeModule<{
  saveAsync(sourceUri: string, fileName: string, mimeType: string): Promise<string>;
  openDownloads(): void;
}>('SaveToDownloads');

export function saveToDownloads(sourceUri: string, fileName: string, mimeType: string): Promise<string> {
  return SaveToDownloads.saveAsync(sourceUri, fileName, mimeType);
}

// Opens the phone's Downloads folder in the system Files app.
export function openDownloadsFolder(): void {
  SaveToDownloads.openDownloads();
}
