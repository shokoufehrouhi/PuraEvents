import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
// Same /legacy file API as persistImage.ts / persistAudio.ts.
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';

import { resetCalendarSyncAfterRestore } from '../calendar/calendarSync';
import { forgetScheduled } from '../storage/notificationLog';

// Backup to the user's own Google Drive, in the app's hidden appDataFolder
// (drive.appdata: only this app can see those files, nothing shows up in
// the user's Drive). Unlike Android Auto Backup this one is the user's to
// trigger — "Back up now" / "Restore" — so it also covers clearing the
// app's data, which Auto Backup can't (Android only restores on install).
//
// What's backed up: the app's own AsyncStorage records (events, widgets,
// preferences, language) as one JSON file, plus every voice recording and
// widget photo as its own Drive file named after its path under
// documentDirectory. Those paths are unique and never rewritten, so a file
// already in Drive is never uploaded again.

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const BACKUP_FILE = 'puraevents-backup.json';
const MEDIA_DIRS = ['event-sounds/', 'widget-photos/'];
const BACKED_UP_KEYS = ['puraevents:events', 'puraevents:widgets', 'puraevents:preferences', 'puraevents:language'];
const STATE_KEY = 'puraevents:driveBackup';

// iOS needs its own OAuth client (Google Cloud project puraevents-revenuecat;
// its reversed id is the URL scheme in app.json). Android finds its clients
// by package name + signing certificate, so it needs nothing here.
const IOS_CLIENT_ID = '832588364667-rvte6c0sjshv753i9l0tm3mheik8jclq.apps.googleusercontent.com';

GoogleSignin.configure({ scopes: [DRIVE_SCOPE], iosClientId: IOS_CLIENT_ID });

export interface DriveBackupState {
  email: string | null;
  lastBackupAt: string | null;
  autoBackup: boolean;
  /** Fingerprint of the data last uploaded — auto backup skips when unchanged. */
  lastHash: string | null;
}

const EMPTY_STATE: DriveBackupState = { email: null, lastBackupAt: null, autoBackup: true, lastHash: null };

export async function loadDriveBackupState(): Promise<DriveBackupState> {
  const raw = await AsyncStorage.getItem(STATE_KEY).catch(() => null);
  return raw ? { ...EMPTY_STATE, ...JSON.parse(raw) } : EMPTY_STATE;
}

async function saveState(patch: Partial<DriveBackupState>): Promise<DriveBackupState> {
  const next = { ...(await loadDriveBackupState()), ...patch };
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(next));
  return next;
}

export class DriveBackupError extends Error {
  constructor(public reason: 'cancelled' | 'noBackup' | 'invalid' | 'network') {
    super(reason);
  }
}

// --- Account -------------------------------------------------------------

/** Google's account picker + the Drive consent screen. */
export async function connectGoogleAccount(): Promise<DriveBackupState> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) throw new DriveBackupError('cancelled');
  return saveState({ email: response.data.user.email });
}

export async function disconnectGoogleAccount(): Promise<DriveBackupState> {
  await GoogleSignin.signOut().catch(() => {});
  return saveState({ email: null, lastHash: null });
}

async function accessToken(): Promise<string> {
  if (!GoogleSignin.getCurrentUser()) {
    // App restarted: the session is kept by Google Play services.
    const response = await GoogleSignin.signInSilently();
    if (response.type !== 'success') throw new DriveBackupError('cancelled');
  }
  return (await GoogleSignin.getTokens()).accessToken;
}

// One retry with a fresh token: Play services caches access tokens, and a
// cached one can expire between calls.
async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken();
    const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } }).catch(() => {
      throw new DriveBackupError('network');
    });
    if (res.status === 401 && attempt === 0) {
      await GoogleSignin.clearCachedAccessToken(token);
      continue;
    }
    if (!res.ok) throw new DriveBackupError('network');
    return res;
  }
  throw new DriveBackupError('network');
}

// --- Drive files ---------------------------------------------------------

interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
}

async function listAppFiles(): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      fields: 'nextPageToken,files(id,name,modifiedTime)',
      pageSize: '1000',
      ...(pageToken ? { pageToken } : {}),
    });
    const body = await (await driveFetch(`${DRIVE}/files?${params}`)).json();
    files.push(...body.files);
    pageToken = body.nextPageToken;
  } while (pageToken);
  return files;
}

async function createFile(name: string): Promise<string> {
  const res = await driveFetch(`${DRIVE}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parents: ['appDataFolder'] }),
  });
  return (await res.json()).id;
}

async function uploadText(fileId: string, text: string): Promise<void> {
  await driveFetch(`${UPLOAD}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: text,
  });
}

async function uploadLocalFile(fileId: string, localUri: string): Promise<void> {
  const token = await accessToken();
  const res = await FileSystem.uploadAsync(`${UPLOAD}/files/${fileId}?uploadType=media`, localUri, {
    httpMethod: 'PATCH',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
  });
  if (res.status < 200 || res.status >= 300) throw new DriveBackupError('network');
}

async function downloadToLocal(fileId: string, localUri: string): Promise<void> {
  const token = await accessToken();
  const res = await FileSystem.downloadAsync(`${DRIVE}/files/${fileId}?alt=media`, localUri, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status < 200 || res.status >= 300) throw new DriveBackupError('network');
}

// --- Backup / restore ----------------------------------------------------

interface BackupFile {
  app: 'PuraEvents';
  version: 1;
  createdAt: string;
  records: Record<string, string | null>;
  media: string[];
}

async function listLocalMedia(): Promise<string[]> {
  const paths: string[] = [];
  for (const dir of MEDIA_DIRS) {
    const names = await FileSystem.readDirectoryAsync(`${FileSystem.documentDirectory}${dir}`).catch(() => []);
    paths.push(...names.map((name) => `${dir}${name}`));
  }
  return paths.sort();
}

async function readRecords(): Promise<Record<string, string | null>> {
  const pairs = await AsyncStorage.multiGet(BACKED_UP_KEYS);
  return Object.fromEntries(pairs);
}

// Cheap fingerprint (djb2) of what a backup would contain — not security,
// just "did anything change since the last upload".
function fingerprint(records: Record<string, string | null>, media: string[]): string {
  const text = JSON.stringify([records, media]);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${hash}:${text.length}`;
}

export async function backUpNow(): Promise<DriveBackupState> {
  const records = await readRecords();
  const media = await listLocalMedia();
  const remote = await listAppFiles();
  const remoteByName = new Map(remote.map((f) => [f.name, f.id]));

  for (const path of media) {
    if (remoteByName.has(path)) continue;
    const id = await createFile(path);
    await uploadLocalFile(id, `${FileSystem.documentDirectory}${path}`);
  }

  const backup: BackupFile = { app: 'PuraEvents', version: 1, createdAt: new Date().toISOString(), records, media };
  const backupId = remoteByName.get(BACKUP_FILE) ?? (await createFile(BACKUP_FILE));
  await uploadText(backupId, JSON.stringify(backup));

  // Media that no longer belongs to any backup (a deleted recording or
  // widget photo) is removed so the hidden folder doesn't keep growing.
  const keep = new Set([BACKUP_FILE, ...media]);
  for (const file of remote) {
    if (!keep.has(file.name)) await driveFetch(`${DRIVE}/files/${file.id}`, { method: 'DELETE' }).catch(() => {});
  }

  return saveState({ lastBackupAt: backup.createdAt, lastHash: fingerprint(records, media) });
}

/** Auto backup: only when signed in, turned on, and something changed. */
export async function backUpIfChanged(): Promise<void> {
  const state = await loadDriveBackupState();
  if (!state.email || !state.autoBackup) return;
  const hash = fingerprint(await readRecords(), await listLocalMedia());
  if (hash === state.lastHash) return;
  await backUpNow();
}

export async function setAutoBackup(autoBackup: boolean): Promise<DriveBackupState> {
  return saveState({ autoBackup });
}

/** When the last backup in Drive was made, or null if there is none. */
export async function findRemoteBackup(): Promise<string | null> {
  const file = (await listAppFiles()).find((f) => f.name === BACKUP_FILE);
  return file?.modifiedTime ?? null;
}

/** Replaces this device's events, widgets and settings with the backup.
 *  The caller reloads the app afterwards, so every screen, reminder and
 *  widget starts from the restored data (and the restored language). */
export async function restoreFromDrive(): Promise<void> {
  const remote = await listAppFiles();
  const backupFile = remote.find((f) => f.name === BACKUP_FILE);
  if (!backupFile) throw new DriveBackupError('noBackup');

  const backup = (await (await driveFetch(`${DRIVE}/files/${backupFile.id}?alt=media`)).json()) as BackupFile;
  if (backup?.app !== 'PuraEvents' || backup.version !== 1 || typeof backup.records !== 'object') {
    throw new DriveBackupError('invalid');
  }

  // Media first: if this fails part-way, local data is still untouched.
  const remoteByName = new Map(remote.map((f) => [f.name, f.id]));
  for (const dir of MEDIA_DIRS) {
    await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}${dir}`, { intermediates: true }).catch(() => {});
  }
  for (const path of backup.media) {
    const id = remoteByName.get(path);
    const local = `${FileSystem.documentDirectory}${path}`;
    if (!id || (await FileSystem.getInfoAsync(local)).exists) continue;
    await downloadToLocal(id, local);
  }

  const toSet = Object.entries(backup.records).filter((e): e is [string, string] => e[1] !== null);
  const toRemove = Object.entries(backup.records).filter(([, v]) => v === null).map(([k]) => k);
  await AsyncStorage.multiSet(toSet);
  if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
  // The old events' reminders go; the restored ones are scheduled on the
  // next launch (restoreMissingReminders sees nothing scheduled).
  await Notifications.cancelAllScheduledNotificationsAsync();
  await forgetScheduled();
  await resetCalendarSyncAfterRestore();
  await saveState({ lastHash: fingerprint(backup.records, backup.media), lastBackupAt: backup.createdAt });
}
