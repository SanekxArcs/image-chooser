import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  setFolder: (folder: string) => ipcRenderer.invoke('set-folder', folder),
  getCurrent: () => ipcRenderer.invoke('get-current'),
  getImagePath: (offset: number) => ipcRenderer.invoke('get-image-path', offset) as Promise<{
    url: string
    isVideo: boolean
  } | null>,
  action: (type: string) => ipcRenderer.invoke('action', type),
  actionShortcut: (key: string) => ipcRenderer.invoke('action-shortcut', key),
  skip: () => ipcRenderer.invoke('skip'),
  back: () => ipcRenderer.invoke('back'),
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
})
