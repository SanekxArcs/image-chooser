export type Action = 'keep' | 'later' | 'delete';

/** What the main process records for an item: a built-in action, `shortcut:<key>`, or `skip`. */
export type Decision = Action | `shortcut:${string}` | 'skip';

export interface MediaItem {
  url: string | null;
  isVideo: boolean;
}

export interface QueueItem {
  name: string;
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

export interface QueueResponse {
  folder: string;
  items: Array<QueueItem & { decision: string | null }>;
  index: number;
  stats: Stats;
  history: Array<{ name: string; decision: string }>;
}

export interface FileInfo {
  size: number;
  modified: number;
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

export type Theme = 'system' | 'light' | 'dark' | 'oled';
export type ResolvedTheme = Exclude<Theme, 'system'>;

export interface AppearanceSettings {
  theme: Theme;
  highPerformanceGpu: boolean;
}

export interface SetFolderResponse {
  total: number;
  index: number;
  stats: Stats;
}

export interface ApplyPendingResponse {
  applied: boolean;
  failures: Array<{
    filename: string;
    action: string;
    error: string;
  }>;
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
  files?: string[];
}

export interface PurgeResponse {
  purged: number;
}
