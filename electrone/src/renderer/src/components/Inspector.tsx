import { memo, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronsRight, Clock, FolderInput, SlidersHorizontal, Trash2 } from 'lucide-react';

import { apiFileInfo } from '../api';
import { useDecodedImage } from '../media/bitmapCache';
import { PANEL_SECTIONS, setSectionVisible, usePanelSections } from '../panelPrefs';
import type { PanelSectionId } from '../panelPrefs';
import type { DisplaySettings, FileInfo, QueueItem, ShortcutFolder, Stats } from '../types';
import { extensionOf, folderBaseName, formatBytes, formatCount, formatDate, truncateName } from '../utils';

interface Props {
  item: QueueItem | null;
  index: number;
  total: number;
  stats: Stats;
  skipped: number;
  shortcuts: ShortcutFolder[] | null;
  shortcutCounts: ReadonlyMap<string, number>;
  display: DisplaySettings;
  overlay: boolean;
  onShortcut: (shortcut: ShortcutFolder) => void;
}

const LABELS = Object.fromEntries(PANEL_SECTIONS.map(s => [s.id, s.label])) as Record<PanelSectionId, string>;

function Inspector({ item, index, total, stats, skipped, shortcuts, shortcutCounts, display, overlay, onShortcut }: Props) {
  const visible = usePanelSections();
  const [editing, setEditing] = useState(false);
  const slot = useDecodedImage(item && !item.isVideo && visible.details ? item.name : null);
  const [info, setInfo] = useState<{ name: string; info: FileInfo | null } | null>(null);

  useEffect(() => {
    if (!item || !visible.details) return;
    let alive = true;
    // Debounced so holding through a burst of decisions doesn't flood IPC.
    const timer = window.setTimeout(() => {
      void apiFileInfo(item.name).then(result => {
        if (alive) setInfo({ name: item.name, info: result });
      }).catch(() => {});
    }, 120);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [item, visible.details]);

  // Esc leaves customize mode instead of leaving the folder.
  useEffect(() => {
    if (!editing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setEditing(false);
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editing]);

  const fileInfo = info && item && info.name === item.name ? info.info : null;
  const dims = slot.state === 'ready' ? slot.image : null;
  const megapixels = dims ? (dims.naturalWidth * dims.naturalHeight) / 1e6 : 0;
  const hasFolders = !!shortcuts && shortcuts.length > 0;
  const anyVisible = PANEL_SECTIONS.some(s => visible[s.id] && (s.id !== 'folders' || hasFolders));

  const section = (id: PanelSectionId, content: ReactNode, opts: { title?: boolean } = {}) => {
    const on = visible[id];
    if (!editing && !on) return null;
    const showHead = editing || opts.title !== false;
    return (
      <section className={`panel${editing && !on ? ' panel--off' : ''}`}>
        {showHead && (
          <div className="panel-head">
            <div className="panel-title">{LABELS[id]}</div>
            {editing && (
              <button
                type="button"
                role="switch"
                className="switch switch--small"
                aria-checked={on}
                aria-label={`Show ${LABELS[id]}`}
                onClick={() => setSectionVisible(id, !on)}
              />
            )}
          </div>
        )}
        {on && content}
      </section>
    );
  };

  return (
    <aside className={`inspector${overlay ? ' inspector--overlay' : ''}`}>
      {section('file', (
        <>
          <div className="file-name">{item?.name ?? '—'}</div>
          <div className="file-sub tabular">
            {formatCount(Math.min(index + 1, total))} of {formatCount(total)} · {formatCount(Math.max(0, total - index))} left
          </div>
          <div className="meter"><span style={{ transform: `scaleX(${total ? index / total : 0})` }} /></div>
        </>
      ), { title: false })}

      {section('details', (
        <dl className="props">
          <dt>Type</dt>
          <dd>{item ? `${extensionOf(item.name)} ${item.isVideo ? 'video' : 'image'}` : '—'}</dd>
          {!item?.isVideo && (
            <>
              <dt>Dimensions</dt>
              <dd>{dims ? `${dims.naturalWidth} × ${dims.naturalHeight}` : '—'}</dd>
              <dt>Resolution</dt>
              <dd>{dims ? `${megapixels.toFixed(megapixels >= 10 ? 0 : 1)} MP` : '—'}</dd>
            </>
          )}
          <dt>Size</dt>
          <dd>{fileInfo ? formatBytes(fileInfo.size) : '—'}</dd>
          <dt>Modified</dt>
          <dd>{fileInfo ? formatDate(fileInfo.modified) : '—'}</dd>
        </dl>
      ))}

      {section('session', (
        <div className="tally">
          <TallyRow icon={<Check size={14} strokeWidth={2.4} />} label="Keep" value={stats.kept} />
          <TallyRow icon={<Clock size={14} strokeWidth={2.2} />} label="Later" value={stats.later} />
          <TallyRow icon={<Trash2 size={14} strokeWidth={2.2} />} label="Delete" value={stats.deleted} />
          <TallyRow icon={<ChevronsRight size={14} strokeWidth={2.2} />} label="Skipped" value={skipped} />
        </div>
      ))}

      {(hasFolders || editing) && section('folders', hasFolders ? (
        <div className="folder-list">
          {(shortcuts ?? []).map(s => (
            <button key={s.key} type="button" className="folder-row" title={s.folderPath} onClick={() => onShortcut(s)}>
              <kbd className="kbd">{s.key}</kbd>
              <span>{truncateName(folderBaseName(s.folderPath), display.truncateLength)}</span>
              <span style={{ flex: 'none', color: 'var(--text-3)' }} className="tabular">
                {shortcutCounts.get(s.key) || ''}
              </span>
              <FolderInput size={14} style={{ color: 'var(--text-3)', flex: 'none' }} />
            </button>
          ))}
        </div>
      ) : (
        <p className="panel-note">Appears here when folder shortcuts are set to “Side panel” in Settings.</p>
      ))}

      {section('keys', (
        <div className="hint-grid">
          <kbd className="kbd">→</kbd><span>Keep</span>
          <kbd className="kbd">←</kbd><span>Delete</span>
          <kbd className="kbd">↓</kbd><span>Later</span>
          <kbd className="kbd">↑</kbd><span>Undo</span>
          <kbd className="kbd">␣</kbd><span>Skip</span>
          <kbd className="kbd">↵</kbd><span>Zoom to 100%</span>
          <kbd className="kbd">⇧</kbd><span>Video sound</span>
          <kbd className="kbd">Esc</kbd><span>Choose another folder</span>
        </div>
      ))}

      {!editing && !anyVisible && (
        <p className="panel-note" style={{ textAlign: 'center', padding: '8px 0' }}>All sections are hidden.</p>
      )}

      <button
        type="button"
        className={`customize-btn${editing ? ' customize-btn--active' : ''}`}
        onClick={() => setEditing(e => !e)}
      >
        {editing
          ? <><Check size={15} strokeWidth={2.4} /> Done</>
          : <><SlidersHorizontal size={15} strokeWidth={1.9} /> Customize panel</>}
      </button>
    </aside>
  );
}

function TallyRow({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="tally-row">
      <span className="tally-icon">{icon}</span>
      <span className="label">{label}</span>
      <span className="value">{formatCount(value)}</span>
    </div>
  );
}

export default memo(Inspector);
