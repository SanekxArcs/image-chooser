import type {
  Action,
  ActionResponse,
  BackResponse,
  BrowseResponse,
  CurrentResponse,
  DeleteCountResponse,
  DrivesResponse,
  PurgeResponse,
  SessionResponse,
  SetFolderResponse,
} from './types';

export async function apiSetFolder(folder: string): Promise<SetFolderResponse> {
  const res = await fetch('/api/set-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Error');
  return data as SetFolderResponse;
}

export async function apiCurrent(): Promise<CurrentResponse> {
  const res = await fetch('/api/current');
  if (!res.ok) throw new Error('Failed to get current image');
  return res.json() as Promise<CurrentResponse>;
}

export function apiImageUrl(offset: 0 | 1, cacheBust: number): string {
  return `/api/image?offset=${offset}&t=${cacheBust}`;
}

export async function apiAction(action: Action): Promise<ActionResponse> {
  const res = await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error('Action failed');
  return res.json() as Promise<ActionResponse>;
}

export async function apiBack(): Promise<BackResponse> {
  const res = await fetch('/api/back', { method: 'POST' });
  if (!res.ok) throw new Error('Undo failed');
  return res.json() as Promise<BackResponse>;
}

export async function apiSession(): Promise<SessionResponse> {
  const res = await fetch('/api/session');
  if (!res.ok) throw new Error('Session check failed');
  return res.json() as Promise<SessionResponse>;
}

export async function apiDrives(): Promise<DrivesResponse> {
  const res = await fetch('/api/drives');
  if (!res.ok) throw new Error('Could not list drives');
  return res.json() as Promise<DrivesResponse>;
}

export async function apiBrowse(path: string): Promise<BrowseResponse> {
  const res = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Cannot read folder');
  return data as BrowseResponse;
}

export async function apiDeleteCount(): Promise<DeleteCountResponse> {
  const res = await fetch('/api/delete-count');
  if (!res.ok) throw new Error('Failed to get delete count');
  return res.json() as Promise<DeleteCountResponse>;
}

export async function apiPurgeDeleted(): Promise<PurgeResponse> {
  const res = await fetch('/api/purge-deleted', { method: 'POST' });
  if (!res.ok) throw new Error('Purge failed');
  return res.json() as Promise<PurgeResponse>;
}
