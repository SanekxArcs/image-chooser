export type Action = 'keep' | 'later' | 'delete';

export interface MediaItem {
  url: string | null;
  isVideo: boolean;
}

export interface Stats {
  kept: number;
  deleted: number;
  later: number;
}

export interface CurrentResponse {
  done: boolean;
  filename?: string;
  index?: number;
  total: number;
  isVideo?: boolean;
}

export interface MediaPathResponse {
  url: string;
  isVideo: boolean;
}

export interface SessionResponse {
  active: boolean;
  folder?: string;
  index?: number;
  total?: number;
  stats?: Stats;
}

export interface ActionResponse {
  done: boolean;
  index: number;
  total: number;
  canUndo: boolean;
}

export interface BackResponse {
  index: number;
  total: number;
  canUndo: boolean;
  undoneAction?: string;
}

export interface ShortcutFolder {
  key: string;
  folderPath: string;
}

export type ShortcutLayout = 'bottom' | 'left' | 'right';

export interface DisplaySettings {
  truncateLength: number | null;
  layout: ShortcutLayout;
}

export interface SetFolderResponse {
  total: number;
  index: number;
  stats: Stats;
}

export interface ApplyPendingResponse {
  applied: boolean;
}

export interface DrivesResponse {
  drives: string[];
}

export interface BrowseResponse {
  path: string;
  parent: string | null;
  dirs: string[];
  imageCount: number;
}

export interface DeleteCountResponse {
  count: number;
}

export interface PurgeResponse {
  purged: number;
}
