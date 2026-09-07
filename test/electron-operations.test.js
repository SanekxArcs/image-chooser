const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.avif',
  '.heic', '.heif', '.svg', '.ico',
]);
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.ogv', '.wmv',
]);
const MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);

function moveFile(source, destination) {
  if (fs.existsSync(destination)) {
    throw new Error('A file with the same name already exists in the destination folder');
  }

  try {
    fs.renameSync(source, destination);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;

    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    try {
      fs.unlinkSync(source);
    } catch (unlinkError) {
      try { fs.unlinkSync(destination); } catch (_) {}
      throw unlinkError;
    }
  }
}

function computeResumeIndex(images, pendingMap, saved) {
  if (saved.nextFilename) {
    const idx = images.indexOf(saved.nextFilename);
    if (idx !== -1) return idx;
    const firstUnreviewed = images.findIndex(f => !pendingMap.has(f));
    return firstUnreviewed !== -1 ? firstUnreviewed : 0;
  }
  if (
    saved.nextFilename === null &&
    saved.index >= images.length &&
    images.length > 0 &&
    pendingMap.size === 0
  ) {
    return images.length;
  }
  const firstUnreviewed = images.findIndex(f => !pendingMap.has(f));
  return firstUnreviewed !== -1 ? firstUnreviewed : Math.min(saved.index, images.length);
}

function purgeDeletedDir(deleteDir) {
  if (!fs.existsSync(deleteDir)) return { purged: 0 };
  const entries = fs.readdirSync(deleteDir, { withFileTypes: true })
    .filter(
      entry =>
        entry.isFile() &&
        !entry.isSymbolicLink() &&
        MEDIA_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    )
    .map(entry => entry.name);

  let purged = 0;
  for (const filename of entries) {
    try {
      fs.unlinkSync(path.join(deleteDir, filename));
      purged++;
    } catch (_) {}
  }

  try {
    const remaining = fs.readdirSync(deleteDir);
    if (remaining.length === 0) fs.rmdirSync(deleteDir);
  } catch (_) {}

  return { purged };
}

test('moveFile moves files safely and prevents overwriting collisions', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-chooser-move-'));
  try {
    const src = path.join(tmpDir, 'source.jpg');
    const dst = path.join(tmpDir, 'dest.jpg');
    fs.writeFileSync(src, 'content');

    moveFile(src, dst);
    assert.equal(fs.existsSync(src), false);
    assert.equal(fs.existsSync(dst), true);

    // Collision check
    fs.writeFileSync(src, 'new-content');
    assert.throws(() => moveFile(src, dst), /already exists in the destination/);
    assert.equal(fs.existsSync(src), true);
    assert.equal(fs.readFileSync(dst, 'utf8'), 'content');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('moveFile cross-volume copy fallback handles EXDEV and cleans up on error', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-chooser-exdev-'));
  try {
    const src = path.join(tmpDir, 'source.jpg');
    const dst = path.join(tmpDir, 'dest.jpg');
    fs.writeFileSync(src, 'exdev-content');

    // Simulate EXDEV by temporarily overriding renameSync
    const origRename = fs.renameSync;
    fs.renameSync = () => {
      const err = new Error('EXDEV: cross-device link not permitted');
      err.code = 'EXDEV';
      throw err;
    };

    try {
      moveFile(src, dst);
      assert.equal(fs.existsSync(src), false);
      assert.equal(fs.existsSync(dst), true);
      assert.equal(fs.readFileSync(dst, 'utf8'), 'exdev-content');
    } finally {
      fs.renameSync = origRename;
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('session recovery via nextFilename does not skip unreviewed files after commit', () => {
  // Scenario: Folder had 10 items. User processed 5.
  // 5 files are moved out to _keep; remaining folder now has 5 files (items 6-10).
  const originalImages = ['img01.jpg', 'img02.jpg', 'img03.jpg', 'img04.jpg', 'img05.jpg', 'img06.jpg', 'img07.jpg', 'img08.jpg', 'img09.jpg', 'img10.jpg'];
  const pendingMap = new Map();

  // Saved session after sorting 5 files:
  const savedSession = {
    folder: '/test/folder',
    index: 5,
    nextFilename: 'img06.jpg',
    pending: [],
  };

  // After moves are applied, folder only has img06..img10
  const remainingImages = ['img06.jpg', 'img07.jpg', 'img08.jpg', 'img09.jpg', 'img10.jpg'];

  // Resume must point to index 0 (img06.jpg), NOT index 5 (which would be out of bounds / skip all remaining items)
  const resumeIndex = computeResumeIndex(remainingImages, pendingMap, savedSession);
  assert.equal(resumeIndex, 0);
  assert.equal(remainingImages[resumeIndex], 'img06.jpg');
});

test('session recovery when nextFilename is removed externally safely falls back to first unreviewed file', () => {
  const images = ['img01.jpg', 'img02.jpg', 'img04.jpg']; // img03 was deleted externally
  const pendingMap = new Map([['img01.jpg', 'keep']]);
  const savedSession = {
    folder: '/test/folder',
    index: 2,
    nextFilename: 'img03.jpg',
    pending: [['img01.jpg', 'keep']],
  };

  const resumeIndex = computeResumeIndex(images, pendingMap, savedSession);
  // Should resume at first unreviewed item: img02.jpg (index 1), not skipping to end
  assert.equal(resumeIndex, 1);
  assert.equal(images[resumeIndex], 'img02.jpg');
});

test('purgeDeletedDir only removes media files and preserves notes and subdirectories', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-chooser-purge-'));
  try {
    const deleteDir = path.join(tmpDir, '_delete');
    fs.mkdirSync(deleteDir, { recursive: true });

    // Create media files
    fs.writeFileSync(path.join(deleteDir, 'photo.jpg'), 'photo');
    fs.writeFileSync(path.join(deleteDir, 'clip.mp4'), 'video');
    // Create non-media file
    fs.writeFileSync(path.join(deleteDir, 'important-notes.txt'), 'do not delete');
    // Create subfolder
    fs.mkdirSync(path.join(deleteDir, 'subfolder'));

    const result = purgeDeletedDir(deleteDir);
    assert.equal(result.purged, 2);
    assert.equal(fs.existsSync(path.join(deleteDir, 'photo.jpg')), false);
    assert.equal(fs.existsSync(path.join(deleteDir, 'clip.mp4')), false);
    assert.equal(fs.existsSync(path.join(deleteDir, 'important-notes.txt')), true);
    assert.equal(fs.existsSync(path.join(deleteDir, 'subfolder')), true);
    assert.equal(fs.existsSync(deleteDir), true); // deleteDir still exists because non-media remains
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
