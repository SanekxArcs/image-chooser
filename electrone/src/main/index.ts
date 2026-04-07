import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, extname, dirname } from 'path'
import {
  existsSync,
  readdirSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  rmdirSync,
  accessSync,
} from 'fs'
import { pathToFileURL } from 'url'

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.avif',
])

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.ogv', '.wmv',
])

const MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS])

const session = {
  folder: null as string | null,
  images: [] as string[],
  index: 0,
  history: [] as Array<{ filename: string; action: string }>,
}

function getMedia(folder: string): string[] {
  return readdirSync(folder)
    .filter(f => MEDIA_EXTENSIONS.has(extname(f).toLowerCase()))
    .sort()
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 480,
    minHeight: 560,
    backgroundColor: '#0f0f13',
    title: 'Image Chooser',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC Handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('set-folder', (_event, folder: string) => {
  if (!folder || !existsSync(folder)) throw new Error('Folder does not exist')
  session.folder = folder
  session.images = getMedia(folder)
  session.index = 0
  session.history = []
  return { total: session.images.length, index: 0 }
})

ipcMain.handle('get-current', () => {
  if (!session.folder) throw new Error('No folder selected')
  session.images = getMedia(session.folder)
  if (session.index >= session.images.length) {
    return { done: true, total: session.images.length }
  }
  const filename = session.images[session.index]
  const isVideo = VIDEO_EXTENSIONS.has(extname(filename).toLowerCase())
  return { filename, index: session.index, total: session.images.length, done: false, isVideo }
})

ipcMain.handle('get-image-path', (_event, offset: number) => {
  const idx = session.index + offset
  if (!session.folder || idx < 0 || idx >= session.images.length) return null
  const filename = session.images[idx]
  const filepath = join(session.folder, filename)
  const isVideo = VIDEO_EXTENSIONS.has(extname(filename).toLowerCase())
  return { url: pathToFileURL(filepath).toString(), isVideo }
})

ipcMain.handle('action', (_event, action: string) => {
  if (!session.folder || session.index >= session.images.length) {
    throw new Error('No current image')
  }
  const filename = session.images[session.index]
  const filepath = join(session.folder, filename)
  const subdirMap: Record<string, string> = { keep: '_keep', delete: '_delete', later: '_later' }
  const subdir = subdirMap[action]
  if (!subdir) throw new Error('Unknown action')
  const destDir = join(session.folder, subdir)
  if (!existsSync(destDir)) mkdirSync(destDir)
  renameSync(filepath, join(destDir, filename))
  session.history.push({ filename, action })
  session.images = getMedia(session.folder)
  const done = session.index >= session.images.length
  return { done, index: session.index, total: session.images.length, canUndo: session.history.length > 0 }
})

ipcMain.handle('skip', () => {
  if (!session.folder || session.index >= session.images.length) return
  const filename = session.images[session.index]
  session.history.push({ filename, action: 'skip' })
  session.index++
  session.images = getMedia(session.folder)
  const done = session.index >= session.images.length
  return { done, index: session.index, total: session.images.length, canUndo: session.history.length > 0 }
})

ipcMain.handle('back', () => {
  const prev = session.history.pop()
  if (!prev) {
    return { index: session.index, total: session.images.length, canUndo: false }
  }
  if (prev.action === 'skip') {
    // File was never moved — just step back
    session.images = getMedia(session.folder!)
    const idx = session.images.indexOf(prev.filename)
    session.index = idx >= 0 ? idx : Math.max(0, session.index - 1)
  } else {
    try {
      const subdirMap: Record<string, string> = { keep: '_keep', delete: '_delete', later: '_later' }
      const subdir = subdirMap[prev.action]
      const src = join(session.folder!, subdir, prev.filename)
      const dest = join(session.folder!, prev.filename)
      if (existsSync(src)) renameSync(src, dest)
      session.images = getMedia(session.folder!)
      const idx = session.images.indexOf(prev.filename)
      session.index = idx >= 0 ? idx : Math.max(0, session.index - 1)
    } catch {
      session.images = getMedia(session.folder!)
      session.index = Math.max(0, session.index - 1)
    }
  }
  return {
    index: session.index,
    total: session.images.length,
    canUndo: session.history.length > 0,
    undoneAction: prev.action,
  }
})

ipcMain.handle('get-session', () => {
  if (!session.folder || !existsSync(session.folder)) return { active: false }
  session.images = getMedia(session.folder)
  const countSubdir = (name: string) => {
    const dir = join(session.folder!, name)
    if (!existsSync(dir)) return 0
    return readdirSync(dir).filter(f => MEDIA_EXTENSIONS.has(extname(f).toLowerCase())).length
  }
  return {
    active: true,
    folder: session.folder,
    index: session.index,
    total: session.images.length,
    stats: {
      kept: countSubdir('_keep'),
      deleted: countSubdir('_delete'),
      later: countSubdir('_later'),
    },
  }
})

ipcMain.handle('get-drives', () => {
  const drives: string[] = []
  for (let i = 65; i <= 90; i++) {
    const drive = `${String.fromCharCode(i)}:\\`
    try { accessSync(drive); drives.push(drive) } catch { /* skip */ }
  }
  return { drives }
})

ipcMain.handle('browse', (_event, dirPath: string) => {
  if (!dirPath || !existsSync(dirPath)) throw new Error('Invalid path')
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true })
    const dirs = entries
      .filter(e => {
        if (!e.isDirectory()) return false
        if (
          e.name.startsWith('.') ||
          e.name === '$Recycle.Bin' ||
          e.name === 'System Volume Information'
        ) return false
        return true
      })
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    const mediaCount = entries.filter(
      e => e.isFile() && MEDIA_EXTENSIONS.has(extname(e.name).toLowerCase())
    ).length
    const parent = dirname(dirPath) !== dirPath ? dirname(dirPath) : null
    return { path: dirPath, parent, dirs, imageCount: mediaCount }
  } catch (err: unknown) {
    throw new Error(`Cannot read folder: ${(err as Error).message}`)
  }
})

ipcMain.handle('get-delete-count', () => {
  if (!session.folder) return { count: 0 }
  const deleteDir = join(session.folder, '_delete')
  if (!existsSync(deleteDir)) return { count: 0 }
  const count = readdirSync(deleteDir).filter(
    f => MEDIA_EXTENSIONS.has(extname(f).toLowerCase())
  ).length
  return { count }
})

ipcMain.handle('purge-deleted', () => {
  if (!session.folder) throw new Error('No folder')
  const deleteDir = join(session.folder, '_delete')
  if (!existsSync(deleteDir)) return { purged: 0 }
  const files = readdirSync(deleteDir)
  let purged = 0
  for (const f of files) {
    try { unlinkSync(join(deleteDir, f)); purged++ } catch { /* skip */ }
  }
  try { rmdirSync(deleteDir) } catch { /* skip */ }
  return { purged }
})

ipcMain.handle('open-folder-dialog', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openDirectory'],
    title: 'Select Media Folder',
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})
