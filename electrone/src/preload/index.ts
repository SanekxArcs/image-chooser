import { contextBridge, ipcRenderer, webUtils } from 'electron'

// One synchronous read at startup so the first frame is painted in the right theme.
const initialAppearance = ipcRenderer.sendSync('get-appearance-sync') as {
  theme: string
  highPerformanceGpu: boolean
  platform: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  initialAppearance,
  // Resolves a folder dropped onto the window to its path on disk.
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  setFolder: (folder: string) => ipcRenderer.invoke('set-folder', folder),
  getCurrent: () => ipcRenderer.invoke('get-current'),
  getQueue: () => ipcRenderer.invoke('get-queue'),
  getFileInfo: (name: string) => ipcRenderer.invoke('get-file-info', name),
  getImagePath: (offset: number) => ipcRenderer.invoke('get-image-path', offset) as Promise<{
    url: string
    isVideo: boolean
  } | null>,
  action: (type: string, expected?: string) => ipcRenderer.invoke('action', type, expected),
  actionShortcut: (key: string, expected?: string) => ipcRenderer.invoke('action-shortcut', key, expected),
  skip: (expected?: string) => ipcRenderer.invoke('skip', expected),
  back: (expected?: string) => ipcRenderer.invoke('back', expected),
  getSession: () => ipcRenderer.invoke('get-session'),
  getDrives: () => ipcRenderer.invoke('get-drives'),
  browse: (path: string) => ipcRenderer.invoke('browse', path),
  getDeleteCount: () => ipcRenderer.invoke('get-delete-count'),
  purgeDeleted: () => ipcRenderer.invoke('purge-deleted'),
  applyPending: () => ipcRenderer.invoke('apply-pending'),
  openFolderDialog: (title?: string) => ipcRenderer.invoke('open-folder-dialog', title) as Promise<string | null>,
  getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),
  saveShortcuts: (list: { key: string; folderPath: string }[]) => ipcRenderer.invoke('save-shortcuts', list),
  getDisplaySettings: () => ipcRenderer.invoke('get-display-settings'),
  saveDisplaySettings: (settings: { truncateLength: number | null; layout: string }) =>
    ipcRenderer.invoke('save-display-settings', settings),
  saveAppearance: (settings: { theme?: string; highPerformanceGpu?: boolean }) =>
    ipcRenderer.invoke('save-appearance', settings),
})
