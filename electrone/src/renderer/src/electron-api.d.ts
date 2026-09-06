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

declare global {
  interface Window {
    electronAPI: {
      setFolder(folder: string): Promise<SetFolderResponse>;
      getCurrent(): Promise<CurrentResponse>;
      getImagePath(offset: number): Promise<MediaPathResponse | null>;
      action(type: Action): Promise<ActionResponse>;
      actionShortcut(key: string): Promise<ActionResponse>;
      skip(): Promise<ActionResponse>;
      back(): Promise<BackResponse>;
      getSession(): Promise<SessionResponse>;
      getDrives(): Promise<DrivesResponse>;
      browse(path: string): Promise<BrowseResponse>;
      getDeleteCount(): Promise<DeleteCountResponse>;
      purgeDeleted(): Promise<PurgeResponse>;
      applyPending(): Promise<ApplyPendingResponse>;
      openFolderDialog(title?: string): Promise<string | null>;
      getShortcuts(): Promise<ShortcutFolder[]>;
      saveShortcuts(list: ShortcutFolder[]): Promise<ShortcutFolder[]>;
      getDisplaySettings(): Promise<DisplaySettings>;
      saveDisplaySettings(settings: DisplaySettings): Promise<DisplaySettings>;
    };
  }
}

export {};
