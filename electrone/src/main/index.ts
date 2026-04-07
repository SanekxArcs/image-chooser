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
  writeFileSync,
  readFileSync,
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
  pending: new Map<string, string>(),
}

interface SavedSession {
  folder: string
  index: number
  pending: [string, string][]
}

function sessionFilePath(): string {
  return join(app.getPath('userData'), 'image-chooser-session.json')
}

function saveSession(): void {
  if (!session.folder) return
  try {
    const data: SavedSession = {
      folder: session.folder,
      index: session.index,
      pending: [...session.pending.entries()],
    }
    writeFileSync(sessionFilePath(), JSON.stringify(data), 'utf8')
  } catch { /* ignore */ }
}

function loadSavedSession(): SavedSession | null {
  try {
    const raw = readFileSync(sessionFilePath(), 'utf8')
    return JSON.parse(raw) as SavedSession
  } catch {
    return null
  }
}

function applyAllPending(): void {
  if (!session.folder) return
  const subdirMap: Record<string, string> = { keep: '_keep', delete: '_delete', later: '_later' }
  for (const [filename, action] of session.pending) {
    const subdir = subdirMap[action]
    if (!subdir) continue
    const src = join(session.folder, filename)
    if (!existsSync(src)) continue
    const destDir = join(session.folder, subdir)
    if (!existsSync(destDir)) mkdirSync(destDir)
    try { renameSync(src, join(destDir, filename)) } catch { /* file may still be locked, skip */ }
  }
  session.pending.clear()
  session.history = []
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
  const images = getMedia(folder)
  const saved = loadSavedSession()

  if (saved && saved.folder === folder) {
    // Resume the existing session for this folder
    const pendingMap = new Map<string, string>(
      saved.pending.filter(([f]) => existsSync(join(folder, f)))
    )
    const resumeIndex = Math.min(saved.index, images.length)
    session.folder = folder
    session.images = images
    session.index = resumeIndex
    session.pending = pendingMap
    session.history = []
    const count = (a: string) => [...pendingMap.values()].filter(v => v === a).length
    return {
      total: images.length,
      index: resumeIndex,
      stats: { kept: count('keep'), deleted: count('delete'), later: count('later') },
    }
  }

  // Fresh start
  session.folder = folder
  session.images = images
  session.index = 0
  session.history = []
  session.pending.clear()
  saveSession()
  return { total: images.length, index: 0, stats: { kept: 0, deleted: 0, later: 0 } }
})

ipcMain.handle('get-current', () => {
  if (!session.folder) throw new Error('No folder selected')
  // Don't re-scan: files stay in folder until apply-pending is called
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
  const subdirMap: Record<string, string> = { keep: '_keep', delete: '_delete', later: '_later' }
  if (!subdirMap[action]) throw new Error('Unknown action')
  const filename = session.images[session.index]
  // Queue the move instead of renaming immediately — avoids EBUSY on open video files
  session.pending.set(filename, action)
  session.history.push({ filename, action })
  session.index++
  const done = session.index >= session.images.length
  saveSession()
  return { done, index: session.index, total: session.images.length, canUndo: session.history.length > 0 }
})

ipcMain.handle('skip', () => {
  if (!session.folder || session.index >= session.images.length) return
  const filename = session.images[session.index]
  session.history.push({ filename, action: 'skip' })
  session.index++
  const done = session.index >= session.images.length
  saveSession()
  return { done, index: session.index, total: session.images.length, canUndo: session.history.length > 0 }
})

ipcMain.handle('back', () => {
  const prev = session.history.pop()
  if (!prev) {
    return { index: session.index, total: session.images.length, canUndo: false }
  }
  // Since files are queued (not moved), undo just removes from pending and steps back
  if (prev.action !== 'skip') {
    session.pending.delete(prev.filename)
  }
  session.index = Math.max(0, session.index - 1)
  saveSession()
  return {
    index: session.index,
    total: session.images.length,
    canUndo: session.history.length > 0,
    undoneAction: prev.action !== 'skip' ? prev.action : undefined,
  }
})

ipcMain.handle('get-session', () => {
  // Use in-memory session if available
  if (session.folder && existsSync(session.folder)) {
    const count = (a: string) => [...session.pending.values()].filter(v => v === a).length
    return {
      active: true,
      folder: session.folder,
      index: session.index,
      total: session.images.length,
      stats: { kept: count('keep'), deleted: count('delete'), later: count('later') },
    }
  }
  // Fall back to saved session on disk (cold start / app restart)
  const saved = loadSavedSession()
  if (!saved || !existsSync(saved.folder)) return { active: false }
  session.folder = saved.folder
  session.images = getMedia(saved.folder)
  session.index = Math.min(saved.index, session.images.length)
  session.pending = new Map(saved.pending.filter(([f]) => existsSync(join(saved.folder, f))))
  session.history = []
  const count = (a: string) => [...session.pending.values()].filter(v => v === a).length
  return {
    active: true,
    folder: session.folder,
    index: session.index,
    total: session.images.length,
    stats: { kept: count('keep'), deleted: count('delete'), later: count('later') },
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
  // Count pending deletes (queued) plus already-moved files
  let count = [...session.pending.values()].filter(a => a === 'delete').length
  const deleteDir = join(session.folder, '_delete')
  if (existsSync(deleteDir)) {
    count += readdirSync(deleteDir).filter(f => MEDIA_EXTENSIONS.has(extname(f).toLowerCase())).length
  }
  return { count }
})

ipcMain.handle('purge-deleted', () => {
  if (!session.folder) throw new Error('No folder')
  // Flush pending deletes to disk first
  applyAllPending()
  saveSession()
  if (session.folder) session.images = getMedia(session.folder)
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

ipcMain.handle('apply-pending', () => {
  applyAllPending()
  if (session.folder && existsSync(session.folder)) {
    session.images = getMedia(session.folder)
  }
  saveSession()
  return { applied: true }
})

// Apply any remaining pending moves when the app is closing
app.on('will-quit', () => {
  applyAllPending()
  saveSession()
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
