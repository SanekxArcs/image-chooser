import type {
  Action,
  ActionResponse,
  AppearanceSettings,
  ApplyPendingResponse,
  BackResponse,
  CurrentResponse,
  DeleteCountResponse,
  DisplaySettings,
  FileInfo,
  PurgeResponse,
  QueueResponse,
  SessionResponse,
  SetFolderResponse,
  ShortcutFolder,
} from './types';

const eAPI = window.electronAPI;

export const initialAppearance = eAPI.initialAppearance;
export const platform = eAPI.initialAppearance.platform;

/** The media protocol URL for a file in the current session folder. */
export function mediaUrl(name: string): string {
  return `image-chooser-media://media/?name=${encodeURIComponent(name)}`;
}

export function pathForDroppedFile(file: File): string {
  return eAPI.getPathForFile(file);
}

export async function apiSetFolder(folder: string): Promise<SetFolderResponse> {
  return eAPI.setFolder(folder);
}

export async function apiCurrent(): Promise<CurrentResponse> {
  return eAPI.getCurrent();
}

export async function apiQueue(): Promise<QueueResponse> {
  return eAPI.getQueue();
}

export async function apiFileInfo(name: string): Promise<FileInfo | null> {
  return eAPI.getFileInfo(name);
}

export async function apiAction(action: Action, expected?: string): Promise<ActionResponse> {
  return eAPI.action(action, expected);
}

export async function apiActionShortcut(key: string, expected?: string): Promise<ActionResponse> {
  return eAPI.actionShortcut(key, expected);
}

export async function apiSkip(expected?: string): Promise<ActionResponse> {
  return eAPI.skip(expected);
}

export async function apiBack(expected?: string): Promise<BackResponse> {
  return eAPI.back(expected);
}

export async function apiSession(): Promise<SessionResponse> {
  return eAPI.getSession();
}

export async function apiDeleteCount(): Promise<DeleteCountResponse> {
  return eAPI.getDeleteCount();
}

export async function apiPurgeDeleted(): Promise<PurgeResponse> {
  return eAPI.purgeDeleted();
}

export async function apiApplyPending(): Promise<ApplyPendingResponse> {
  return eAPI.applyPending();
}

export async function apiOpenFolderDialog(title?: string): Promise<string | null> {
  return eAPI.openFolderDialog(title);
}

export async function apiGetShortcuts(): Promise<ShortcutFolder[]> {
  return eAPI.getShortcuts();
}

export async function apiSaveShortcuts(list: ShortcutFolder[]): Promise<ShortcutFolder[]> {
  return eAPI.saveShortcuts(list);
}

export async function apiGetDisplaySettings(): Promise<DisplaySettings> {
  return eAPI.getDisplaySettings();
}

export async function apiSaveDisplaySettings(settings: DisplaySettings): Promise<DisplaySettings> {
  return eAPI.saveDisplaySettings(settings);
}

export async function apiSaveAppearance(settings: Partial<AppearanceSettings>): Promise<AppearanceSettings> {
  return eAPI.saveAppearance(settings);
}
