import type {
  Action,
  ActionResponse,
  BackResponse,
  BrowseResponse,
  CurrentResponse,
  DeleteCountResponse,
  DrivesResponse,
  MediaPathResponse,
  PurgeResponse,
  SessionResponse,
  SetFolderResponse,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eAPI = (window as any).electronAPI;

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

export async function apiOpenFolderDialog(): Promise<string | null> {
  return eAPI.openFolderDialog();
}
