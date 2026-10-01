import { useRef, useState } from 'react';
import { FolderOpen, Loader2 } from 'lucide-react';

import { apiOpenFolderDialog, apiSetFolder, pathForDroppedFile } from '../api';
import AppMark from './AppMark';
import { Toast } from './Overlays';
import TitleBar from './TitleBar';

interface Props {
  onFolderSelected: () => void;
  onOpenSettings: () => void;
}

const KEYS: Array<[string, string]> = [
  ['→', 'Keep'],
  ['←', 'Delete'],
  ['↓', 'Later'],
  ['↑', 'Undo'],
  ['␣', 'Skip'],
  ['↵', 'Zoom 100%'],
  ['⇧', 'Video sound'],
  ['Esc', 'Change folder'],
];

export default function SetupScreen({ onFolderSelected, onOpenSettings }: Props) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  async function open(path: string) {
    setLoading(true);
    setError('');
    try {
      const data = await apiSetFolder(path);
      if (data.total === 0 && !data.stats.kept && !data.stats.deleted && !data.stats.later) {
        setError('No images or videos found in that folder.');
        setLoading(false);
        return;
      }
      onFolderSelected();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Failed to open folder.');
      setLoading(false);
    }
  }

  async function browse() {
    const path = await apiOpenFolderDialog();
    if (path) await open(path);
  }

  return (
    <>
      <TitleBar
        onOpenSettings={onOpenSettings}
        left={(
          <div className="titlebar-title">
            <span className="mark"><AppMark size={18} /></span>
            Image Chooser
          </div>
        )}
      />
      <div
        className="screen"
        onDragEnter={e => {
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={e => e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={e => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          const file = e.dataTransfer.files[0];
          const path = file ? pathForDroppedFile(file) : '';
          if (path) void open(path);
        }}
      >
        <div className="hero">
          <div className="hero-mark"><AppMark size={62} /></div>
          <div>
            <h1>Sort a folder at the<br />speed of a swipe.</h1>
            <p>Keep, delete or save for later — your files never leave this computer.</p>
          </div>

          <div className="hero-actions">
            <button
              type="button"
              className="btn btn--primary btn--large"
              onClick={() => void browse()}
              disabled={loading}
              style={{ minWidth: 220 }}
            >
              {loading ? <Loader2 size={18} className="spin" /> : <FolderOpen size={18} strokeWidth={1.9} />}
              {loading ? 'Opening…' : 'Open folder'}
            </button>
            <span className="drop-hint">or drop a folder anywhere in this window</span>
          </div>

          <div className="keys">
            {KEYS.map(([key, label]) => (
              <div key={key} className="key-tile">
                <kbd className="kbd">{key}</kbd>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {dragging && <div className="drop-overlay">Drop to open this folder</div>}
      </div>
      {error && <Toast message={error} onClose={() => setError('')} />}
    </>
  );
}
