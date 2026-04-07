import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  setFolder: (folder: string) => ipcRenderer.invoke('set-folder', folder),
  getCurrent: () => ipcRenderer.invoke('get-current'),
  getImagePath: (offset: number) => ipcRenderer.invoke('get-image-path', offset) as Promise<string | null>,
  action: (type: string) => ipcRenderer.invoke('action', type),
  skip: () => ipcRenderer.invoke('skip'),
  back: () => ipcRenderer.invoke('back'),
  getSession: () => ipcRenderer.invoke('get-session'),
  getDrives: () => ipcRenderer.invoke('get-drives'),
  browse: (path: string) => ipcRenderer.invoke('browse', path),
  getDeleteCount: () => ipcRenderer.invoke('get-delete-count'),
  purgeDeleted: () => ipcRenderer.invoke('purge-deleted'),
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog') as Promise<string | null>,
})
