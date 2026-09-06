const setupScreen  = document.getElementById('setup-screen');
const viewerScreen = document.getElementById('viewer-screen');
const folderInput  = document.getElementById('folder-input');
const startBtn     = document.getElementById('start-btn');
const browseBtn    = document.getElementById('browse-btn');
const setupError   = document.getElementById('setup-error');

// Browser modal elements
const browserOverlay  = document.getElementById('browser-overlay');
const browserList     = document.getElementById('browser-list');
const browserCrumb    = document.getElementById('browser-breadcrumb');
const browserClose    = document.getElementById('browser-close');
const browserSelect   = document.getElementById('browser-select');
const browserImgCount = document.getElementById('browser-image-count');

const cardStack    = document.getElementById('card-stack');
const card         = document.getElementById('card');
const mainImg      = document.getElementById('main-img');
const peek1        = document.getElementById('peek-1');
const peek1Img     = document.getElementById('peek-1-img');
const peek2        = document.getElementById('peek-2');
const peek2Img     = document.getElementById('peek-2-img');
const counterLeft  = document.getElementById('counter-left');
const progressBar  = document.getElementById('progress-bar');
const statKept     = document.getElementById('stat-kept');
const statLater    = document.getElementById('stat-later');
const statDeleted  = document.getElementById('stat-deleted');
const filenameBar  = document.getElementById('filename-bar');
const doneCard     = document.getElementById('done-card');
const doneStats    = document.getElementById('done-stats');
const purgeBtn     = document.getElementById('purge-btn');
const purgeCount   = document.getElementById('purge-count');

const btnKeep      = document.getElementById('btn-keep');
const btnDelete    = document.getElementById('btn-delete');
const btnLater     = document.getElementById('btn-later');
const btnBack      = document.getElementById('btn-back');
const changeFolderBtn = document.getElementById('change-folder-btn');
const restartBtn   = document.getElementById('restart-btn');

const labelKeep   = document.getElementById('label-keep');
const labelDelete = document.getElementById('label-delete');
const labelLater  = document.getElementById('label-later');

let stats = { kept: 0, deleted: 0, later: 0 };
let busy = false;

// ── Screens ──────────────────────────────────────────────
function showSetup() {
  viewerScreen.classList.remove('active');
  setupScreen.classList.add('active');
  setupError.textContent = '';
  stats = { kept: 0, deleted: 0, later: 0 };
}

function showViewer() {
  setupScreen.classList.remove('active');
  viewerScreen.classList.add('active');
}

// ── Folder browser ────────────────────────────────────────
let browserCurrentPath = null;

function openBrowser() {
  browserOverlay.classList.remove('hidden');
  browserSelect.disabled = true;
  browserImgCount.textContent = '';
  browserCurrentPath = null;
  loadDrives();
}

function closeBrowser() {
  browserOverlay.classList.add('hidden');
}

async function loadDrives() {
  browserCrumb.innerHTML = '';
  browserList.innerHTML = '<div class="browser-loading">Loading drives…</div>';
  browserSelect.disabled = true;
  browserImgCount.textContent = '';
  browserCurrentPath = null;

  const res  = await fetch('/api/drives');
  const data = await res.json();

  browserList.innerHTML = '';
  for (const drive of data.drives) {
    const el = document.createElement('div');
    el.className = 'drive-item';
    const icon = document.createElement('span');
    icon.className = 'drive-icon';
    icon.textContent = '💾';
    const label = document.createElement('span');
    label.textContent = drive;
    el.append(icon, label);
    el.addEventListener('click', () => browseFolder(drive));
    browserList.appendChild(el);
  }
}

async function browseFolder(dirPath) {
  browserList.innerHTML = '<div class="browser-loading">Loading…</div>';
  browserSelect.disabled = true;
  browserImgCount.textContent = '';

  const res  = await fetch(`/api/browse?path=${encodeURIComponent(dirPath)}`);
  const data = await res.json();

  if (!res.ok) {
    browserList.innerHTML = '';
    const error = document.createElement('div');
    error.className = 'browser-empty';
    error.textContent = `⚠ ${data.error}`;
    browserList.appendChild(error);
    return;
  }

  browserCurrentPath = data.path;

  // Build breadcrumb
  buildBreadcrumb(data.path);

  // Image count badge
  if (data.imageCount > 0) {
    browserImgCount.textContent = `${data.imageCount} image${data.imageCount !== 1 ? 's' : ''} here`;
    browserSelect.disabled = false;
  } else {
    browserImgCount.textContent = 'No images in this folder';
    browserSelect.disabled = true;
  }

  // Folder list
  browserList.innerHTML = '';
  if (data.dirs.length === 0) {
    browserList.innerHTML = '<div class="browser-empty">No subfolders</div>';
    return;
  }

  for (const dir of data.dirs) {
    const fullPath = `${data.path.replace(/[\\/]$/, '')}\\${dir}`;
    const el = document.createElement('div');
    el.className = 'folder-item';
    const icon = document.createElement('span');
    icon.className = 'folder-icon';
    icon.textContent = '📁';
    const name = document.createElement('span');
    name.className = 'folder-name';
    name.textContent = dir;
    const arrow = document.createElement('span');
    arrow.className = 'folder-arrow';
    arrow.textContent = '›';
    el.append(icon, name, arrow);
    el.addEventListener('click', () => browseFolder(fullPath));
    browserList.appendChild(el);
  }
}

function buildBreadcrumb(dirPath) {
  browserCrumb.innerHTML = '';

  // "Drives" root link
  const rootBtn = document.createElement('button');
  rootBtn.type = 'button';
  rootBtn.className = 'crumb';
  rootBtn.textContent = 'Drives';
  rootBtn.addEventListener('click', loadDrives);
  browserCrumb.appendChild(rootBtn);

  // Split path into parts (handle both C:\ and C:\foo\bar)
  const parts = dirPath.replace(/[\\/]+$/, '').split(/[\\/]/);
  // parts[0] = "C:", parts[1..] = folders
  let built = '';
  for (let i = 0; i < parts.length; i++) {
    const sep = document.createElement('span');
    sep.className = 'crumb-sep';
    sep.textContent = ' › ';
    browserCrumb.appendChild(sep);

    built = i === 0 ? `${parts[0]}\\` : `${built.replace(/[\\/]$/, '')}\\${parts[i]}`;
    const isLast = i === parts.length - 1;
    const crumb = document.createElement('button');
    crumb.type = 'button';
    crumb.className = `crumb${isLast ? ' active' : ''}`;
    crumb.textContent = parts[i] || '\\';
    if (!isLast) {
      const captured = built;
      crumb.addEventListener('click', () => browseFolder(captured));
    }
    browserCrumb.appendChild(crumb);
  }
}

browseBtn.addEventListener('click', openBrowser);
browserClose.addEventListener('click', closeBrowser);
browserOverlay.addEventListener('click', e => { if (e.target === browserOverlay) closeBrowser(); });

browserSelect.addEventListener('click', () => {
  if (!browserCurrentPath) return;
  folderInput.value = browserCurrentPath;
  closeBrowser();
  startSession();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !browserOverlay.classList.contains('hidden')) closeBrowser();
});

// ── Start / folder selection ──────────────────────────────
startBtn.addEventListener('click', startSession);
folderInput.addEventListener('keydown', e => { if (e.key === 'Enter') startSession(); });

async function startSession() {
  const folder = folderInput.value.trim();
  if (!folder) { setupError.textContent = 'Please enter a folder path.'; return; }

  setupError.textContent = '';
  startBtn.disabled = true;
  startBtn.textContent = 'Loading…';

  try {
    const res = await fetch('/api/set-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
    const data = await res.json();
    if (!res.ok) { setupError.textContent = data.error || 'Error'; return; }
    if (data.total === 0) { setupError.textContent = 'No images found in that folder.'; return; }

    showViewer();
    loadCurrent();
  } catch {
    setupError.textContent = 'Could not connect to server.';
  } finally {
    startBtn.disabled = false;
    startBtn.textContent = 'Start';
  }
}

// ── Image loader helper ───────────────────────────────────
function loadImg(imgEl, src) {
  return new Promise(resolve => {
    imgEl.onload = imgEl.onerror = resolve;
    imgEl.src = src;
  });
}

// ── Apply state from /api/current into DOM ────────────────
// Called inside startViewTransition callback — awaited so
// the browser captures the fully-painted new frame.
async function applyCurrentState() {
  const res  = await fetch('/api/current');
  const data = await res.json();

  if (data.done) {
    await showDone();
    return;
  }

  const { total, index, filename } = data;
  const left = total - index;
  counterLeft.textContent = `${left} left`;
  progressBar.style.width = `${(index / total) * 100}%`;
  filenameBar.textContent = filename;

  // Reset labels & show card
  labelKeep.style.opacity = labelDelete.style.opacity = labelLater.style.opacity = '0';
  cardStack.style.display = '';
  card.style.display = '';   // reset from showDone's display:none
  doneCard.classList.add('hidden');

  const t = Date.now();
  const remaining = total - index - 1; // images after the current one

  // Load main + up to 2 peek images in parallel, wait for all
  const jobs = [loadImg(mainImg, `/api/image?t=${t}`)];

  if (remaining >= 1) {
    peek1.classList.remove('invisible');
    jobs.push(loadImg(peek1Img, `/api/image?offset=1&t=${t}`));
  } else {
    peek1.classList.add('invisible');
  }

  if (remaining >= 2) {
    peek2.classList.remove('invisible');
    jobs.push(loadImg(peek2Img, `/api/image?offset=2&t=${t}`));
  } else {
    peek2.classList.add('invisible');
  }

  await Promise.all(jobs);
  busy = false;
}

// ── Initial load (no transition) ──────────────────────────
async function loadCurrent() {
  await applyCurrentState();
}

// ── Run a view transition, falling back to direct call ────
async function withTransition(exitDir, fn) {
  document.documentElement.dataset.exit = exitDir;
  if (document.startViewTransition) {
    await document.startViewTransition(fn).finished;
  } else {
    await fn();
  }
  delete document.documentElement.dataset.exit;
}

async function showDone() {
  cardStack.style.display = 'none';
  doneCard.classList.remove('hidden');
  doneStats.textContent =
    `${stats.kept} → _keep · ${stats.later} → _later · ${stats.deleted} → _delete`;
  progressBar.style.width = '100%';
  counterLeft.textContent = '0 left';

  // Check if there are files waiting in _delete
  const res  = await fetch('/api/delete-count');
  const data = await res.json();
  if (data.count > 0) {
    purgeCount.textContent = data.count;
    purgeBtn.classList.remove('hidden');
  } else {
    purgeBtn.classList.add('hidden');
  }
}

// ── Actions ───────────────────────────────────────────────
const exitDir = { keep: 'right', delete: 'left', later: 'down' };
const labelEl = { keep: labelKeep, delete: labelDelete, later: labelLater };

async function doAction(action) {
  if (busy) return;
  busy = true;

  // Show label immediately — it will be captured in the old-state screenshot
  labelEl[action].style.opacity = '1';

  // Update stats counter
  if (action === 'keep')   { stats.kept++;    statKept.textContent    = stats.kept; }
  if (action === 'delete') { stats.deleted++; statDeleted.textContent = stats.deleted; }
  if (action === 'later')  { stats.later++;   statLater.textContent   = stats.later; }

  await withTransition(exitDir[action], async () => {
    await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    await applyCurrentState();
  });
}

async function doBack() {
  if (busy) return;
  busy = true;

  const res  = await fetch('/api/back', { method: 'POST' });
  const data = await res.json();

  if (data.undoneAction === 'keep')   { stats.kept    = Math.max(0, stats.kept    - 1); statKept.textContent    = stats.kept; }
  if (data.undoneAction === 'delete') { stats.deleted = Math.max(0, stats.deleted - 1); statDeleted.textContent = stats.deleted; }
  if (data.undoneAction === 'later')  { stats.later   = Math.max(0, stats.later   - 1); statLater.textContent   = stats.later; }

  await withTransition('undo', () => applyCurrentState());
}

// ── Button events ─────────────────────────────────────────
btnKeep.addEventListener('click',   () => { flash(btnKeep);   doAction('keep');   });
btnDelete.addEventListener('click', () => { flash(btnDelete); doAction('delete'); });
btnLater.addEventListener('click',  () => { flash(btnLater);  doAction('later');  });
btnBack.addEventListener('click',   () => { flash(btnBack);   doBack();           });
changeFolderBtn.addEventListener('click', showSetup);
restartBtn.addEventListener('click', showSetup);

purgeBtn.addEventListener('click', async () => {
  const n = purgeCount.textContent;
  if (!confirm(`Permanently delete ${n} file(s)? This cannot be undone.`)) return;
  await fetch('/api/purge-deleted', { method: 'POST' });
  purgeBtn.classList.add('hidden');
});

// ── Button flash on press ─────────────────────────────────
function flash(btn) {
  btn.classList.remove('flash');
  void btn.offsetWidth; // reflow to restart animation
  btn.classList.add('flash');
}

// ── Keyboard shortcuts ────────────────────────────────────
document.addEventListener('keydown', e => {
  if (setupScreen.classList.contains('active')) return;
  if (e.target.tagName === 'INPUT') return;

  switch (e.key) {
    case 'ArrowRight': flash(btnKeep);   doAction('keep');   break;
    case 'ArrowLeft':  flash(btnDelete); doAction('delete'); break;
    case 'ArrowUp':    flash(btnBack);   doBack();           break;
    case 'ArrowDown':  flash(btnLater);  doAction('later');  break;
  }
});

// ── Touch / mouse drag swipe ──────────────────────────────
let dragStart = null;

card.addEventListener('pointerdown', e => {
  dragStart = { x: e.clientX, y: e.clientY };
  card.setPointerCapture(e.pointerId);
});

card.addEventListener('pointermove', e => {
  if (!dragStart) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  card.style.transform = `translate(${dx * 0.4}px, ${dy * 0.2}px) rotate(${dx * 0.03}deg)`;

  const threshold = 60;
  labelKeep.style.opacity   = dx >  threshold ? Math.min((dx - threshold) / 60, 1) : '0';
  labelDelete.style.opacity = dx < -threshold ? Math.min((-dx - threshold) / 60, 1) : '0';
  labelLater.style.opacity  = dy >  threshold ? Math.min((dy - threshold) / 60, 1) : '0';
});

card.addEventListener('pointerup', e => {
  if (!dragStart) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  dragStart = null;
  card.style.transform = '';

  labelKeep.style.opacity = labelDelete.style.opacity = labelLater.style.opacity = '0';

  if (dx > 100)       doAction('keep');
  else if (dx < -100) doAction('delete');
  else if (dy > 100)  doAction('later');
});

// ── Restore session after page refresh ───────────────────
(async () => {
  try {
    const res  = await fetch('/api/session');
    const data = await res.json();
    if (!data.active) return; // stay on setup screen

    // Restore stat counters from what's already in the subfolders
    stats.kept    = data.stats.kept;
    stats.deleted = data.stats.deleted;
    stats.later   = data.stats.later;
    statKept.textContent    = stats.kept;
    statDeleted.textContent = stats.deleted;
    statLater.textContent   = stats.later;

    // Restore folder path in the input so "← Folder" makes sense
    folderInput.value = data.folder;

    if (data.index >= data.total) {
      // Was on the done screen — jump straight back there
      showViewer();
      await showDone();
    } else {
      showViewer();
      await loadCurrent();
    }
  } catch {
    // Server not ready or no session — stay on setup screen
  }
})();
