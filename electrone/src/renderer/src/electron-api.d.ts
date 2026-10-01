import type {
  Action,
  ActionResponse,
  AppearanceSettings,
  ApplyPendingResponse,
  BackResponse,
  BrowseResponse,
  CurrentResponse,
  DeleteCountResponse,
  DisplaySettings,
  DrivesResponse,
  FileInfo,
  MediaPathResponse,
  PurgeResponse,
  QueueResponse,
  SessionResponse,
  SetFolderResponse,
  ShortcutFolder,
} from './types';

declare global {
  interface Window {
    electronAPI: {
      initialAppearance: AppearanceSettings & { platform: string };
      getPathForFile(file: File): string;
      setFolder(folder: string): Promise<SetFolderResponse>;
      getCurrent(): Promise<CurrentResponse>;
      getQueue(): Promise<QueueResponse>;
      getFileInfo(name: string): Promise<FileInfo | null>;
      getImagePath(offset: number): Promise<MediaPathResponse | null>;
      action(type: Action, expected?: string): Promise<ActionResponse>;
      actionShortcut(key: string, expected?: string): Promise<ActionResponse>;
      skip(expected?: string): Promise<ActionResponse>;
      back(expected?: string): Promise<BackResponse>;
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
      saveAppearance(settings: Partial<AppearanceSettings>): Promise<AppearanceSettings>;
    };
  }
}

export {};
