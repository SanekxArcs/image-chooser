import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Plus, Trash2, X } from 'lucide-react';

import {
  apiGetDisplaySettings,
  apiGetShortcuts,
  apiOpenFolderDialog,
  apiSaveAppearance,
  apiSaveDisplaySettings,
  apiSaveShortcuts,
  initialAppearance,
} from '../api';
import { PANEL_SECTIONS, setSectionVisible, usePanelSections } from '../panelPrefs';
import { THEME_LABELS, THEME_ORDER, useTheme } from '../theme';
import type { DisplaySettings, ShortcutFolder, Theme } from '../types';
import { folderBaseName } from '../utils';

interface Props {
  onClose: () => void;
}

interface Row extends ShortcutFolder {
  id: number;
}

// Swatches for each theme's preview tile: window, panel and stage colours.
const PREVIEW: Record<Exclude<Theme, 'system'>, { bg: string; panel: string; stage: string; ink: string }> = {
  light: { bg: '#f5f5f5', panel: '#ffffff', stage: '#e4e4e4', ink: '#0a0a0a' },
  dark: { bg: '#121212', panel: '#1c1c1e', stage: '#0a0a0a', ink: '#f5f5f5' },
  oled: { bg: '#000000', panel: '#000000', stage: '#000000', ink: '#ffffff' },
};

function ThemePreview({ theme }: { theme: Theme }) {
  if (theme === 'system') {
    const l = PREVIEW.light;
    const d = PREVIEW.dark;
    return (
      <span className="theme-preview" style={{ background: `linear-gradient(135deg, ${l.bg} 50%, ${d.bg} 50%)` }}>
        <span className="split"><i style={{ background: l.ink }} /><i style={{ background: d.ink }} /></span>
        <span className="split"><i style={{ background: l.stage }} /><i style={{ background: d.stage, outline: '1px solid #333' }} /></span>
        <span className="split"><i style={{ background: l.panel }} /><i style={{ background: d.panel }} /></span>
      </span>
    );
  }
  const p = PREVIEW[theme];
  const hairline = theme === 'oled' ? '1px solid rgba(255,255,255,0.22)' : 'none';
  return (
    <span className="theme-preview" style={{ background: p.bg }}>
      <i style={{ background: p.ink, width: '45%' }} />
      <i style={{ background: p.stage, outline: hairline }} />
      <i style={{ background: p.panel, outline: hairline }} />
    </span>
  );
}

// The GPU switch applies at launch, so the value the app started with is
// remembered separately from the saved preference.
let gpuSetting = initialAppearance.highPerformanceGpu;

function nextFreeKey(existing: Row[]): string {
  const used = new Set(existing.map(s => s.key));
  for (const c of '123456789abcdefghijklmnopqrstuvwxyz0') if (!used.has(c)) return c;
  return '';
}

export default function SettingsSheet({ onClose }: Props) {
  const [theme, setTheme] = useTheme();
  const panelSections = usePanelSections();
  const [rows, setRows] = useState<Row[]>([]);
  const [display, setDisplay] = useState<DisplaySettings>({ truncateLength: 14, layout: 'bottom' });
  const [gpu, setGpu] = useState(gpuSetting);
  const gpuChanged = gpu !== initialAppearance.highPerformanceGpu;
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const nextId = useRef(0);

  useEffect(() => {
    void Promise.all([apiGetShortcuts(), apiGetDisplaySettings()]).then(([list, displaySettings]) => {
      setRows(list.map(s => ({ ...s, id: nextId.current++ })));
      setDisplay(displaySettings);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  function edit(update: (rows: Row[]) => Row[]) {
    setRows(update);
    setDirty(true);
    setSaved(false);
  }

  function editDisplay(update: (d: DisplaySettings) => DisplaySettings) {
    setDisplay(update);
    setDirty(true);
    setSaved(false);
  }

  async function addRow() {
    const folderPath = await apiOpenFolderDialog('Select folder for shortcut');
    if (!folderPath) return;
    edit(prev => [...prev, { id: nextId.current++, key: nextFreeKey(prev), folderPath }]);
  }

  async function changeFolder(id: number) {
    const folderPath = await apiOpenFolderDialog('Select folder for shortcut');
    if (!folderPath) return;
    edit(prev => prev.map(s => (s.id === id ? { ...s, folderPath } : s)));
  }

  async function save() {
    setError('');
    const keys = rows.map(s => s.key.trim().toLowerCase());
    if (keys.some(key => !/^[a-z0-9]$/.test(key))) {
      setError('Every folder needs a single letter or number key.');
      return;
    }
    if (new Set(keys).size !== keys.length) {
      setError('Shortcut keys must be unique.');
      return;
    }
    setSaving(true);
    try {
      const [clean, cleanDisplay] = await Promise.all([
        apiSaveShortcuts(rows.map(s => ({ key: s.key.trim().toLowerCase(), folderPath: s.folderPath }))),
        apiSaveDisplaySettings(display),
      ]);
      setRows(clean.map(s => ({ ...s, id: nextId.current++ })));
      setDisplay(cleanDisplay);
      setDirty(false);
      setSaved(true);
    } catch {
      setError('Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  function toggleGpu() {
    const value = !gpu;
    gpuSetting = value;
    setGpu(value);
    void apiSaveAppearance({ highPerformanceGpu: value }).catch(() => {});
  }

  return (
    <div className="scrim" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="sheet-head">
          <h2>Settings</h2>
          <button type="button" className="icon-btn" onClick={onClose} title="Close (Esc)">
            <X size={18} />
          </button>
        </div>

        <div className="sheet-body">
          <section>
            <h3 className="section-title">Appearance</h3>
            <p className="section-desc">OLED uses true black everywhere, so unused pixels on OLED screens stay off.</p>
            <div className="theme-grid">
              {THEME_ORDER.map(t => (
                <button key={t} type="button" className="theme-tile" aria-pressed={theme === t} onClick={() => setTheme(t)}>
                  <ThemePreview theme={t} />
                  {THEME_LABELS[t]}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="section-title">Folder shortcuts</h3>
            <p className="section-desc">Press a key while viewing to send the file to that folder.</p>
            <div className="group">
              {loading ? (
                <div className="group-row"><span className="desc">Loading…</span></div>
              ) : rows.length === 0 ? (
                <div className="group-row"><span className="desc">No shortcut folders yet.</span></div>
              ) : rows.map(s => (
                <div key={s.id} className="group-row">
                  <input
                    className="key-input"
                    value={s.key}
                    aria-label="Shortcut key"
                    onChange={e => {
                      const key = e.target.value.slice(-1).toLowerCase();
                      edit(prev => prev.map(r => (r.id === s.id ? { ...r, key } : r)));
                    }}
                  />
                  <button type="button" className="path-btn" onClick={() => void changeFolder(s.id)} title={s.folderPath}>
                    <FolderOpen size={15} style={{ flex: 'none', color: 'var(--text-3)' }} />
                    <span>{folderBaseName(s.folderPath)}</span>
                    <span className="path">{s.folderPath}</span>
                  </button>
                  <button type="button" className="icon-btn" onClick={() => edit(prev => prev.filter(r => r.id !== s.id))} title="Remove">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <div className="group-row">
                <button type="button" className="btn" onClick={() => void addRow()} style={{ height: 34 }}>
                  <Plus size={15} /> Add folder
                </button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="section-title">Display</h3>
            <div className="group">
              <div className="group-row">
                <div className="grow">
                  <div className="title">Show folder shortcuts</div>
                  <div className="desc">Side panel falls back to the bottom bar when the panel is hidden.</div>
                </div>
                <div className="segmented">
                  <button
                    type="button"
                    aria-pressed={display.layout === 'bottom'}
                    onClick={() => editDisplay(d => ({ ...d, layout: 'bottom' }))}
                  >Bottom bar</button>
                  <button
                    type="button"
                    aria-pressed={display.layout !== 'bottom'}
                    onClick={() => editDisplay(d => ({ ...d, layout: 'right' }))}
                  >Side panel</button>
                </div>
              </div>
              <div className="group-row">
                <div className="grow">
                  <div className="title">Shorten folder names</div>
                  <div className="desc">Maximum characters before a name is cut off.</div>
                </div>
                <input
                  type="number"
                  min={1}
                  className="text-input"
                  style={{ width: 72 }}
                  disabled={display.truncateLength === null}
                  value={display.truncateLength ?? 14}
                  onChange={e => editDisplay(d => ({ ...d, truncateLength: Math.max(1, Number(e.target.value) || 1) }))}
                />
                <button
                  type="button"
                  role="switch"
                  className="switch"
                  aria-checked={display.truncateLength !== null}
                  aria-label="Shorten folder names"
                  onClick={() => editDisplay(d => ({ ...d, truncateLength: d.truncateLength === null ? 14 : null }))}
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="section-title">Side panel</h3>
            <p className="section-desc">Choose which sections the details panel shows. Changes apply right away.</p>
            <div className="group">
              {PANEL_SECTIONS.map(s => (
                <div key={s.id} className="group-row">
                  <div className="grow">
                    <div className="title">{s.label}</div>
                    <div className="desc">{s.description}</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    className="switch"
                    aria-checked={panelSections[s.id]}
                    aria-label={`Show ${s.label}`}
                    onClick={() => setSectionVisible(s.id, !panelSections[s.id])}
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="section-title">Performance</h3>
            <div className="group">
              <div className="group-row">
                <div className="grow">
                  <div className="title">Use high-performance graphics</div>
                  <div className="desc">
                    {gpuChanged
                      ? 'Restart Image Chooser to apply.'
                      : 'Prefers the dedicated GPU on laptops with two. Smoother, uses more battery.'}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  className="switch"
                  aria-checked={gpu}
                  aria-label="Use high-performance graphics"
                  onClick={toggleGpu}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="sheet-foot">
          <span className={`status${error ? ' status--error' : ''}`}>
            {error || (saved ? 'Saved.' : dirty ? 'Unsaved changes' : '')}
          </span>
          <button type="button" className="btn" onClick={onClose}>{dirty ? 'Discard' : 'Done'}</button>
          {dirty && (
            <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
