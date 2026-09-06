const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
const PORT = 3456;
const clientDist = path.join(__dirname, 'client', 'dist');
const frontendDir = fs.existsSync(clientDist)
  ? clientDist
  : path.join(__dirname, 'public');

app.use(express.json());
app.use(express.static(frontendDir));

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.avif']);

// In-memory session state
const session = {
  folder: null,
  images: [],
  index: 0,
  history: [], // [{ filename, action }]
};

function getImages(folder) {
  return fs.readdirSync(folder, { withFileTypes: true })
    .filter(entry => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map(entry => entry.name)
    .sort();
}

// Set folder
app.post('/api/set-folder', (req, res) => {
  const { folder } = req.body;
  if (!folder || !fs.existsSync(folder)) {
    return res.status(400).json({ error: 'Folder does not exist' });
  }

  session.folder = folder;
  session.images = getImages(folder);
  session.index = 0;
  session.history = [];

  res.json({ total: session.images.length, index: 0 });
});

// Get current image info
app.get('/api/current', (_req, res) => {
  if (!session.folder) return res.status(400).json({ error: 'No folder selected' });

  // Refresh image list in case files changed
  session.images = getImages(session.folder);

  if (session.index >= session.images.length) {
    return res.json({ done: true, total: session.images.length });
  }

  const filename = session.images[session.index];
  res.json({
    filename,
    index: session.index,
    total: session.images.length,
    done: false,
  });
});

// Serve image at current index + optional offset (for peek cards)
app.get('/api/image', (req, res) => {
  const offset = parseInt(req.query.offset ?? '0', 10);
  const idx = session.index + offset;
  if (!session.folder || idx < 0 || idx >= session.images.length) {
    return res.status(404).send('No image');
  }
  const filename = session.images[idx];
  const filepath = path.join(session.folder, filename);
  res.sendFile(filepath);
});

// Perform action on current image
app.post('/api/action', (req, res) => {
  const { action } = req.body;
  if (!session.folder || session.index >= session.images.length) {
    return res.status(400).json({ error: 'No current image' });
  }

  const filename = session.images[session.index];
  const filepath = path.join(session.folder, filename);
  const subdir = { keep: '_keep', delete: '_delete', later: '_later' }[action];
  if (!subdir) {
    return res.status(400).json({ error: 'Unknown action' });
  }

  try {
    const destDir = path.join(session.folder, subdir);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.renameSync(filepath, path.join(destDir, filename));

    session.history.push({ filename, action });

    // All actions move the file out of the main folder, so the list shrinks —
    // the same index already points to the next image, never increment.
    session.images = getImages(session.folder);

    const done = session.index >= session.images.length;
    res.json({
      done,
      index: session.index,
      total: session.images.length,
      canUndo: session.history.length > 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List available drives (Windows)
app.get('/api/drives', (_req, res) => {
  const drives = [];
  for (let i = 65; i <= 90; i++) {
    const drive = `${String.fromCharCode(i)}:\\`;
    try { fs.accessSync(drive); drives.push(drive); } catch (_) {}
  }
  res.json({ drives });
});

// Browse folders at a path
app.get('/api/browse', (req, res) => {
  const dirPath = req.query.path;
  if (!dirPath || !fs.existsSync(dirPath)) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const dirs = entries
      .filter(e => {
        if (!e.isDirectory()) return false;
        // Skip hidden and system-ish folders
        if (e.name.startsWith('.') || e.name === '$Recycle.Bin' || e.name === 'System Volume Information') return false;
        return true;
      })
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const imageCount = entries.filter(e =>
      e.isFile() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase())
    ).length;

    const parent = path.dirname(dirPath) !== dirPath ? path.dirname(dirPath) : null;
    res.json({ path: dirPath, parent, dirs, imageCount });
  } catch (err) {
    res.status(403).json({ error: `Cannot read folder: ${err.message}` });
  }
});

// Undo last action
app.post('/api/back', (_req, res) => {
  const prev = session.history.pop();
  if (!prev) {
    return res.json({ index: session.index, total: session.images.length, canUndo: false });
  }

  try {
    // All actions moved the file to a subfolder — move it back
    const subdir = { keep: '_keep', delete: '_delete', later: '_later' }[prev.action];
    const src  = path.join(session.folder, subdir, prev.filename);
    const dest = path.join(session.folder, prev.filename);
    if (fs.existsSync(src)) fs.renameSync(src, dest);

    session.images = getImages(session.folder);

    // Find where the previous file now sits and land on it
    const idx = session.images.indexOf(prev.filename);
    session.index = idx >= 0 ? idx : Math.max(0, session.index - 1);

  } catch (_) {
    // If restore failed, at least step index back
    session.images = getImages(session.folder);
    session.index = Math.max(0, session.index - 1);
  }

  res.json({ index: session.index, total: session.images.length, canUndo: session.history.length > 0, undoneAction: prev.action });
});

// Count files in _delete folder
app.get('/api/delete-count', (_req, res) => {
  if (!session.folder) return res.json({ count: 0 });
  const deleteDir = path.join(session.folder, '_delete');
  if (!fs.existsSync(deleteDir)) return res.json({ count: 0 });
  const count = fs.readdirSync(deleteDir)
    .filter(f => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase())).length;
  res.json({ count });
});

// Permanently delete everything in _delete folder
app.post('/api/purge-deleted', (_req, res) => {
  if (!session.folder) return res.status(400).json({ error: 'No folder' });
  const deleteDir = path.join(session.folder, '_delete');
  if (!fs.existsSync(deleteDir)) return res.json({ purged: 0 });

  const files = fs.readdirSync(deleteDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map(entry => entry.name);
  let purged = 0;
  for (const f of files) {
    try { fs.unlinkSync(path.join(deleteDir, f)); purged++; } catch (_) {}
  }
  try { fs.rmdirSync(deleteDir); } catch (_) {}
  res.json({ purged });
});

// Return current session state so the browser can restore after a refresh
app.get('/api/session', (_req, res) => {
  if (!session.folder || !fs.existsSync(session.folder)) {
    return res.json({ active: false });
  }

  session.images = getImages(session.folder); // re-scan in case files changed

  const countSubdir = (name) => {
    const dir = path.join(session.folder, name);
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir)
      .filter(f => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase())).length;
  };

  res.json({
    active: true,
    folder: session.folder,
    index: session.index,
    total: session.images.length,
    stats: {
      kept:    countSubdir('_keep'),
      deleted: countSubdir('_delete'),
      later:   countSubdir('_later'),
    },
  });
});

// Let client-side routing fall back to the built React app when it exists.
if (fs.existsSync(clientDist)) {
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

if (require.main === module) {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Image Chooser running at http://localhost:${PORT}`);
  });
}

module.exports = { app };
