import { app, BrowserWindow, ipcMain, dialog, nativeTheme, net, protocol, screen } from 'electron'
import { join, extname, dirname, basename } from 'path'
import {
  existsSync,
  readdirSync,
  mkdirSync,
  renameSync,
  copyFileSync,
  constants as fsConstants,
  unlinkSync,
  rmdirSync,
  accessSync,
  writeFileSync,
  readFileSync,
  statSync,
} from 'fs'
import { stat } from 'fs/promises'
import { pathToFileURL } from 'url'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'image-chooser-media',
    privileges: {
      standard: true,
      secure: true,
      corsEnabled: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
])

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
  nextFilename?: string | null
  pending: [string, string][]
}

interface ShortcutFolder {
  key: string
  folderPath: string
}

type ShortcutLayout = 'bottom' | 'left' | 'right'
type Theme = 'system' | 'light' | 'dark' | 'oled'

interface DisplaySettings {
  truncateLength: number | null
  layout: ShortcutLayout
}

interface AppearanceSettings {
  theme: Theme
  highPerformanceGpu: boolean
}

interface ApplyFailure {
  filename: string
  action: string
  error: string
}

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = { truncateLength: 14, layout: 'bottom' }
const DEFAULT_APPEARANCE: AppearanceSettings = { theme: 'system', highPerformanceGpu: true }
const THEMES: Theme[] = ['system', 'light', 'dark', 'oled']

// Title bar overlay colours must match the renderer's --chrome token per theme.
const CHROME_COLORS: Record<Exclude<Theme, 'system'>, { bg: string; fg: string }> = {
  light: { bg: '#f5f5f5', fg: '#0a0a0a' },
  dark: { bg: '#121212', fg: '#f5f5f5' },
  oled: { bg: '#000000', fg: '#f5f5f5' },
}
const TITLE_BAR_HEIGHT = 44
const DEV_ICON = join(__dirname, '../../build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')

let shortcuts: ShortcutFolder[] = []
let displaySettings: DisplaySettings = { ...DEFAULT_DISPLAY_SETTINGS }
let appearance: AppearanceSettings = { ...DEFAULT_APPEARANCE }

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function sessionFilePath(): string {
  return join(app.getPath('userData'), 'image-chooser-session.json')
}

function settingsFilePath(): string {
  return join(app.getPath('userData'), 'image-chooser-settings.json')
}

function loadSettingsFile(): {
  shortcuts: ShortcutFolder[]
  display: DisplaySettings
  appearance: AppearanceSettings
} {
  try {
    const raw = readFileSync(settingsFilePath(), 'utf8')
    const data = JSON.parse(raw) as {
      shortcuts?: ShortcutFolder[]
      display?: Partial<DisplaySettings>
      appearance?: Partial<AppearanceSettings>
    }
    const loadedAppearance = { ...DEFAULT_APPEARANCE, ...data.appearance }
    if (!THEMES.includes(loadedAppearance.theme)) loadedAppearance.theme = DEFAULT_APPEARANCE.theme
    return {
      shortcuts: Array.isArray(data.shortcuts) ? data.shortcuts : [],
      display: { ...DEFAULT_DISPLAY_SETTINGS, ...data.display },
      appearance: loadedAppearance,
    }
  } catch {
    return {
      shortcuts: [],
      display: { ...DEFAULT_DISPLAY_SETTINGS },
      appearance: { ...DEFAULT_APPEARANCE },
    }
  }
}

function saveSettingsFile(): void {
  try {
    writeFileSync(
      settingsFilePath(),
      JSON.stringify({ shortcuts, display: displaySettings, appearance }),
      'utf8'
    )
  } catch { /* ignore */ }
}

// Settings are read before `ready` because GPU switches only take effect then.
{
  const loaded = loadSettingsFile()
  shortcuts = loaded.shortcuts
  displaySettings = loaded.display
  appearance = loaded.appearance
}

if (appearance.highPerformanceGpu) {
  // On hybrid-GPU laptops Chromium otherwise picks the integrated adapter.
  app.commandLine.appendSwitch('force_high_performance_gpu')
}
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

function saveSession(): void {
  if (!session.folder) return
  try {
    const nextFilename =
      session.index < session.images.length ? session.images[session.index] : null
    const data: SavedSession = {
      folder: session.folder,
      index: session.index,
      nextFilename,
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

function computeResumeIndex(
  images: string[],
  pendingMap: Map<string, string>,
  saved: SavedSession
): number {
  if (saved.nextFilename) {
    const idx = images.indexOf(saved.nextFilename)
    if (idx !== -1) return idx
    const firstUnreviewed = images.findIndex(f => !pendingMap.has(f))
    return firstUnreviewed !== -1 ? firstUnreviewed : 0
  }
  if (
    saved.nextFilename === null &&
    saved.index >= images.length &&
    images.length > 0 &&
    pendingMap.size === 0
  ) {
    return images.length
  }
  const firstUnreviewed = images.findIndex(f => !pendingMap.has(f))
  return firstUnreviewed !== -1 ? firstUnreviewed : Math.min(saved.index, images.length)
}

function resolveDestDir(action: string): string | null {
  if (!session.folder) return null
  const subdirMap: Record<string, string> = { keep: '_keep', delete: '_delete', later: '_later' }
  if (subdirMap[action]) return join(session.folder, subdirMap[action])
  if (action.startsWith('shortcut:')) {
    const key = action.slice('shortcut:'.length)
    const match = shortcuts.find(s => s.key === key)
    return match ? match.folderPath : null
  }
  return null
}

function moveFile(source: string, destination: string): void {
  if (existsSync(destination)) {
    throw new Error('A file with the same name already exists in the destination folder')
  }

  try {
    renameSync(source, destination)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error

    // Renaming between drives is not supported by the operating system. Copy
    // without overwriting first, then remove the source only after a full copy.
    copyFileSync(source, destination, fsConstants.COPYFILE_EXCL)
    try {
      unlinkSync(source)
    } catch (unlinkError) {
      // Keep the original if cleanup fails; remove our copy so the user can
      // retry without ending up with an unreported duplicate.
      try { unlinkSync(destination) } catch { /* best effort cleanup */ }
      throw unlinkError
    }
  }
}

function applyAllPending(): ApplyFailure[] {
  if (!session.folder) return []
  const failures: ApplyFailure[] = []
  for (const [filename, action] of [...session.pending.entries()]) {
    try {
      const destDir = resolveDestDir(action)
      if (!destDir) throw new Error('The destination folder is no longer available')
      const src = join(session.folder, filename)
      if (!existsSync(src)) throw new Error('The source file is no longer available')
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
      moveFile(src, join(destDir, filename))
      session.pending.delete(filename)
    } catch (error: unknown) {
      failures.push({
        filename,
        action,
        error: error instanceof Error ? error.message : 'Unknown file operation error',
      })
    }
  }

  // A commit changes the folder contents. Rebuilding the queue from the files
  // still in the source folder prevents a stale index from skipping media after
  // an app restart or after choosing the folder again.
  session.images = getMedia(session.folder)
  session.index = 0
  session.history = session.history.filter(h => session.pending.has(h.filename))
  return failures
}

function getMedia(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true })
    .filter(entry => entry.isFile() && MEDIA_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .map(entry => entry.name)
    .sort(nameCollator.compare)
}

function isVideoName(filename: string): boolean {
  return VIDEO_EXTENSIONS.has(extname(filename).toLowerCase())
}

function sessionStats() {
  let kept = 0
  let deleted = 0
  let later = 0
  for (const action of session.pending.values()) {
    if (action === 'keep') kept++
    else if (action === 'delete') deleted++
    else if (action === 'later') later++
  }
  return { kept, deleted, later }
}

// The renderer advances optimistically, so every decision names the file it
// was meant for. A mismatch means the two sides drifted and must never move
// the wrong file.
function assertCurrent(expected: unknown): string {
  if (!session.folder || session.index >= session.images.length) {
    throw new Error('No current image')
  }
  const filename = session.images[session.index]
  if (expected !== undefined && expected !== filename) {
    throw new Error('Out of sync with the current file')
  }
  return filename
}

function resolvedTheme(): Exclude<Theme, 'system'> {
  if (appearance.theme !== 'system') return appearance.theme
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

function applyNativeTheme(): void {
  nativeTheme.themeSource = appearance.theme === 'oled' ? 'dark' : appearance.theme
}

function applyWindowChrome(win: BrowserWindow): void {
  const colors = CHROME_COLORS[resolvedTheme()]
  win.setBackgroundColor(colors.bg)
  if (process.platform !== 'darwin') {
    try {
      win.setTitleBarOverlay({ color: colors.bg, symbolColor: colors.fg, height: TITLE_BAR_HEIGHT })
    } catch { /* overlay not available on this platform */ }
  }
}

function createWindow(): void {
  applyNativeTheme()
  const colors = CHROME_COLORS[resolvedTheme()]
  const { workAreaSize } = screen.getPrimaryDisplay()

  const win = new BrowserWindow({
    width: Math.round(Math.min(1680, workAreaSize.width * 0.86)),
    height: Math.round(Math.min(1050, workAreaSize.height * 0.88)),
    minWidth: 380,
    minHeight: 500,
    show: false,
    backgroundColor: colors.bg,
    title: 'Image Chooser',
    // Packaged builds take the icon from the executable; this covers dev runs and Linux.
    ...(existsSync(DEV_ICON) ? { icon: DEV_ICON } : {}),
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 15 } }
      : { titleBarOverlay: { color: colors.bg, symbolColor: colors.fg, height: TITLE_BAR_HEIGHT } }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  })

  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', event => event.preventDefault())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  protocol.handle('image-chooser-media', async request => {
    try {
      const name = new URL(request.url).searchParams.get('name')
      // Reject anything that is not a plain filename inside the session folder
      if (!session.folder || !name || name !== basename(name) || name === '.' || name === '..') {
        return new Response(null, { status: 404 })
      }
      const filepath = join(session.folder, name)
      if (!existsSync(filepath)) return new Response(null, { status: 404 })

      // Forward Range so videos can seek without reading the whole file.
      const range = request.headers.get('range')
      const response = await net.fetch(pathToFileURL(filepath).toString(), {
        headers: range ? { range } : undefined,
      })
      // The decode worker fetches with CORS, so the response must allow it.
      const headers = new Headers(response.headers)
      headers.set('Access-Control-Allow-Origin', '*')
      return new Response(response.body, { status: response.status, headers })
    } catch {
      return new Response(null, { status: 404 })
    }
  })

  createWindow()

  nativeTheme.on('updated', () => {
    for (const win of BrowserWindow.getAllWindows()) applyWindowChrome(win)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC Handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('set-folder', (_event, folder: string) => {
  if (typeof folder !== 'string' || !folder || !existsSync(folder) || !statSync(folder).isDirectory()) {
    throw new Error('Folder does not exist or is not a directory')
  }
  const images = getMedia(folder)
  const saved = loadSavedSession()

  if (saved && saved.folder === folder) {
    // Resume the existing session for this folder
    const pendingMap = new Map<string, string>(
      saved.pending.filter(([f]) => existsSync(join(folder, f)))
    )
    const resumeIndex = computeResumeIndex(images, pendingMap, saved)
    session.folder = folder
    session.images = images
    session.index = resumeIndex
    session.pending = pendingMap
    session.history = []
    return { total: images.length, index: resumeIndex, stats: sessionStats() }
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
  return { filename, index: session.index, total: session.images.length, done: false, isVideo: isVideoName(filename) }
})

// The whole queue in one round trip lets the renderer prefetch ahead and
// animate decisions without waiting on IPC.
ipcMain.handle('get-queue', () => {
  if (!session.folder) throw new Error('No folder selected')
  return {
    folder: session.folder,
    items: session.images.map(name => ({
      name,
      isVideo: isVideoName(name),
      decision: session.pending.get(name) ?? null,
    })),
    index: session.index,
    stats: sessionStats(),
    history: session.history.map(h => ({ name: h.filename, decision: h.action })),
  }
})

ipcMain.handle('get-file-info', async (_event, name: string) => {
  if (!session.folder || typeof name !== 'string' || name !== basename(name)) return null
  try {
    const info = await stat(join(session.folder, name))
    return { size: info.size, modified: info.mtimeMs }
  } catch {
    return null
  }
})

ipcMain.handle('get-image-path', (_event, offset: number) => {
  if (typeof offset !== 'number' || !Number.isInteger(offset)) return null
  const idx = session.index + offset
  if (!session.folder || idx < 0 || idx >= session.images.length) return null
  const filename = session.images[idx]
  // The filename is part of the URL so each item gets a distinct resource —
  // a fixed URL would make the renderer reuse the first image from cache forever.
  return { url: `image-chooser-media://media/?name=${encodeURIComponent(filename)}`, isVideo: isVideoName(filename) }
})

function advanceResult() {
  return {
    done: session.index >= session.images.length,
    index: session.index,
    total: session.images.length,
    canUndo: session.history.length > 0,
  }
}

ipcMain.handle('action', (_event, action: string, expected?: string) => {
  if (typeof action !== 'string') throw new Error('Invalid action')
  const subdirMap: Record<string, string> = { keep: '_keep', delete: '_delete', later: '_later' }
  if (!subdirMap[action]) throw new Error('Unknown action')
  const filename = assertCurrent(expected)
  // Queue the move instead of renaming immediately — avoids EBUSY on open video files
  session.pending.set(filename, action)
  session.history.push({ filename, action })
  session.index++
  saveSession()
  return advanceResult()
})

ipcMain.handle('action-shortcut', (_event, key: string, expected?: string) => {
  if (typeof key !== 'string' || !/^[a-z0-9]$/i.test(key.trim())) {
    throw new Error('Invalid shortcut key')
  }
  const normalizedKey = key.trim().toLowerCase()
  const match = shortcuts.find(s => s.key === normalizedKey)
  if (!match) throw new Error('No folder assigned to that shortcut')
  const filename = assertCurrent(expected)
  const actionId = `shortcut:${normalizedKey}`
  session.pending.set(filename, actionId)
  session.history.push({ filename, action: actionId })
  session.index++
  saveSession()
  return advanceResult()
})

ipcMain.handle('skip', (_event, expected?: string) => {
  const filename = assertCurrent(expected)
  session.history.push({ filename, action: 'skip' })
  session.index++
  saveSession()
  return advanceResult()
})

ipcMain.handle('back', (_event, expected?: string) => {
  const top = session.history[session.history.length - 1]
  if (top && expected !== undefined && top.filename !== expected) {
    throw new Error('Out of sync with the undo history')
  }
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
    return {
      active: true,
      folder: session.folder,
      index: session.index,
      total: session.images.length,
      stats: sessionStats(),
    }
  }
  // Fall back to saved session on disk (cold start / app restart)
  const saved = loadSavedSession()
  if (!saved || !existsSync(saved.folder)) return { active: false }
  session.folder = saved.folder
  session.images = getMedia(saved.folder)
  const pendingMap = new Map(saved.pending.filter(([f]) => existsSync(join(saved.folder!, f))))
  const resumeIndex = computeResumeIndex(session.images, pendingMap, saved)
  session.index = resumeIndex
  session.pending = pendingMap
  session.history = []
  return {
    active: true,
    folder: session.folder,
    index: session.index,
    total: session.images.length,
    stats: sessionStats(),
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
  if (typeof dirPath !== 'string' || !dirPath || !existsSync(dirPath) || !statSync(dirPath).isDirectory()) {
    throw new Error('Invalid path')
  }
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
  if (!session.folder) return { count: 0, files: [] }
  // Count pending deletes (queued) plus already-moved files
  const pendingFiles = [...session.pending.entries()]
    .filter(([_, a]) => a === 'delete')
    .map(([f]) => f)

  let diskFiles: string[] = []
  const deleteDir = join(session.folder, '_delete')
  if (existsSync(deleteDir)) {
    diskFiles = readdirSync(deleteDir, { withFileTypes: true })
      .filter(
        entry =>
          entry.isFile() &&
          !entry.isSymbolicLink() &&
          MEDIA_EXTENSIONS.has(extname(entry.name).toLowerCase())
      )
      .map(entry => entry.name)
  }

  const allTargets = [...new Set([...pendingFiles, ...diskFiles])]
  return { count: allTargets.length, files: allTargets }
})

ipcMain.handle('purge-deleted', () => {
  if (!session.folder) throw new Error('No folder')
  // Flush pending deletes to disk first
  const failures = applyAllPending()
  if (failures.length > 0) {
    throw new Error(`Could not apply ${failures.length} pending file move(s). Review the folder and try again.`)
  }
  saveSession()
  const deleteDir = join(session.folder, '_delete')
  if (!existsSync(deleteDir)) return { purged: 0 }
  const files = readdirSync(deleteDir, { withFileTypes: true })
    .filter(
      entry =>
        entry.isFile() &&
        !entry.isSymbolicLink() &&
        MEDIA_EXTENSIONS.has(extname(entry.name).toLowerCase())
    )
    .map(entry => entry.name)
  let purged = 0
  for (const f of files) {
    try { unlinkSync(join(deleteDir, f)); purged++ } catch { /* skip */ }
  }
  try {
    const remaining = readdirSync(deleteDir)
    if (remaining.length === 0) rmdirSync(deleteDir)
  } catch { /* skip */ }
  return { purged }
})

ipcMain.handle('apply-pending', () => {
  const failures = applyAllPending()
  saveSession()
  return { applied: failures.length === 0, failures }
})

// Apply any remaining pending moves when the app is closing
app.on('will-quit', () => {
  applyAllPending()
  saveSession()
})

ipcMain.handle('open-folder-dialog', async (event, title?: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('Invalid sender window')
  const safeTitle = typeof title === 'string' ? title.slice(0, 100) : 'Select Media Folder'
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: safeTitle,
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('get-shortcuts', () => shortcuts)

ipcMain.handle('save-shortcuts', (_event, list: ShortcutFolder[]) => {
  if (!Array.isArray(list)) throw new Error('Invalid shortcut list')
  const seen = new Set<string>()
  const clean: ShortcutFolder[] = []
  for (const s of list ?? []) {
    const key = String(s?.key ?? '').trim().toLowerCase()
    const folderPath = String(s?.folderPath ?? '')
    if (!/^[a-z0-9]$/.test(key)) continue
    if (seen.has(key)) continue
    if (!folderPath || !existsSync(folderPath)) continue
    seen.add(key)
    clean.push({ key, folderPath })
  }
  shortcuts = clean
  saveSettingsFile()
  return shortcuts
})

ipcMain.handle('get-display-settings', () => displaySettings)

ipcMain.handle('save-display-settings', (_event, settings: Partial<DisplaySettings>) => {
  if (!settings || typeof settings !== 'object') throw new Error('Invalid display settings')
  const layout: ShortcutLayout =
    settings.layout === 'left' || settings.layout === 'right' ? settings.layout : 'bottom'
  const truncateLength =
    typeof settings.truncateLength === 'number' && settings.truncateLength > 0
      ? Math.floor(settings.truncateLength)
      : null
  displaySettings = { truncateLength, layout }
  saveSettingsFile()
  return displaySettings
})

// Read synchronously by the preload so the first paint already has the theme.
ipcMain.on('get-appearance-sync', event => {
  event.returnValue = { ...appearance, platform: process.platform }
})

ipcMain.handle('save-appearance', (event, next: Partial<AppearanceSettings>) => {
  if (!next || typeof next !== 'object') throw new Error('Invalid appearance settings')
  if (next.theme !== undefined) {
    if (!THEMES.includes(next.theme)) throw new Error('Unknown theme')
    appearance.theme = next.theme
  }
  if (typeof next.highPerformanceGpu === 'boolean') {
    appearance.highPerformanceGpu = next.highPerformanceGpu
  }
  saveSettingsFile()
  applyNativeTheme()
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) applyWindowChrome(win)
  return appearance
})
