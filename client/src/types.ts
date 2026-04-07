export type Action = 'keep' | 'later' | 'delete';

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
  undoneAction?: Action;
}

export interface SetFolderResponse {
  total: number;
  index: number;
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
