import type {
  Action,
  ActionResponse,
  ApplyPendingResponse,
  BackResponse,
  BrowseResponse,
  CurrentResponse,
  DeleteCountResponse,
  DisplaySettings,
  DrivesResponse,
  MediaPathResponse,
  PurgeResponse,
  SessionResponse,
  SetFolderResponse,
  ShortcutFolder,
} from './types';

const eAPI = window.electronAPI;

export async function apiSetFolder(folder: string): Promise<SetFolderResponse> {
  return eAPI.setFolder(folder);
}

export async function apiCurrent(): Promise<CurrentResponse> {
  return eAPI.getCurrent();
}

export async function apiGetMediaPath(offset: 0 | 1): Promise<MediaPathResponse> {
  const result = await eAPI.getImagePath(offset);
  return result ?? { url: '', isVideo: false };
}

export async function apiAction(action: Action): Promise<ActionResponse> {
  return eAPI.action(action);
}

export async function apiActionShortcut(key: string): Promise<ActionResponse> {
  return eAPI.actionShortcut(key);
}

export async function apiSkip(): Promise<ActionResponse> {
  return eAPI.skip();
}

export async function apiBack(): Promise<BackResponse> {
  return eAPI.back();
}

export async function apiSession(): Promise<SessionResponse> {
  return eAPI.getSession();
}

export async function apiDrives(): Promise<DrivesResponse> {
  return eAPI.getDrives();
}

export async function apiBrowse(path: string): Promise<BrowseResponse> {
  return eAPI.browse(path);
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
