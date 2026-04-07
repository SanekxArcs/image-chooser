import { useState, useEffect, useCallback } from 'react';
import { apiDrives, apiBrowse } from '../api';

type BrowseState =
  | { type: 'drives'; drives: string[] }
  | { type: 'folder'; path: string; parent: string | null; dirs: string[]; imageCount: number };

interface Props {
  onSelect: (path: string) => void;
  onClose: () => void;
}

export default function BrowserModal({ onSelect, onClose }: Props) {
  const [state, setState] = useState<{ type: 'loading' } | BrowseState>({ type: 'loading' });
  const [error, setError] = useState('');

  const loadDrives = useCallback(async () => {
    setState({ type: 'loading' });
    setError('');
    try {
      const data = await apiDrives();
      setState({ type: 'drives', drives: data.drives });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load drives');
    }
  }, []);

  const browseFolder = useCallback(async (path: string) => {
    setState({ type: 'loading' });
    setError('');
    try {
      const data = await apiBrowse(path);
      setState({
        type: 'folder',
        path: data.path,
        parent: data.parent,
        dirs: data.dirs,
        imageCount: data.imageCount,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Cannot read folder');
      // reload drives as fallback so user can navigate
    }
  }, []);

  useEffect(() => {
    void loadDrives();
  }, [loadDrives]);

  // Close on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Build breadcrumb segments from a Windows path like C:\foo\bar
  function buildCrumbs(dirPath: string): Array<{ label: string; path: string }> {
    const normalized = dirPath.replace(/[\\/]+$/, '');
    const parts = normalized.split(/[\\/]/);
    const crumbs: Array<{ label: string; path: string }> = [];
    let built = '';
    for (let i = 0; i < parts.length; i++) {
      built = i === 0 ? `${parts[0]}\\` : `${built.replace(/[\\/]$/, '')}\\${parts[i]}`;
      crumbs.push({ label: parts[i] || '\\', path: built });
    }
    return crumbs;
  }

  const canSelect = state.type === 'folder' && state.imageCount > 0;
  const currentPath = state.type === 'folder' ? state.path : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col overflow-hidden rounded-2xl"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          width: 'min(560px, 94vw)',
          maxHeight: '80vh',
          boxShadow: '0 32px 100px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span className="font-semibold text-[0.95rem]">Choose a folder</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm transition-colors hover:bg-[#2a2a3a]"
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Breadcrumb */}
        <div
          className="flex items-center flex-wrap gap-0.5 px-4 py-2.5 flex-shrink-0 min-h-[44px]"
          style={{ borderBottom: '1px solid var(--border)', background: '#14141e' }}
        >
          <button
            type="button"
            onClick={() => void loadDrives()}
            className="rounded-md px-1.5 py-0.5 text-[0.8rem] transition-colors hover:bg-[#1e1e3a]"
            style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer' }}
          >
            Drives
          </button>
          {state.type === 'folder' && buildCrumbs(state.path).map((crumb, i, arr) => {
            const isLast = i === arr.length - 1;
            return (
              <span key={crumb.path} className="flex items-center">
                <span className="text-[0.75rem] mx-0.5" style={{ color: 'var(--border)' }}> › </span>
                <button
                  type="button"
                  onClick={isLast ? undefined : () => void browseFolder(crumb.path)}
                  className={`rounded-md px-1.5 py-0.5 text-[0.8rem] max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap transition-colors ${isLast ? 'font-semibold cursor-default' : 'hover:bg-[#1e1e3a] cursor-pointer'}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: isLast ? 'var(--text)' : '#818cf8',
                    cursor: isLast ? 'default' : 'pointer',
                  }}
                >
                  {crumb.label}
                </button>
              </span>
            );
          })}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2" style={{ scrollbarWidth: 'thin' }}>
          {state.type === 'loading' && (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--muted)' }}>
              Loading…
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--muted)' }}>
              ⚠ {error}
            </div>
          )}

          {state.type === 'drives' && state.drives.map(drive => (
            <div
              key={drive}
              onClick={() => void browseFolder(drive)}
              className="flex items-center gap-3 px-3.5 py-3 rounded-xl cursor-pointer mb-1.5 transition-colors hover:bg-[#22223a] text-sm font-semibold"
              style={{ border: '1px solid var(--border)' }}
            >
              <span className="text-xl">💾</span>
              <span>{drive}</span>
            </div>
          ))}

          {state.type === 'folder' && (
            <>
              {state.dirs.length === 0 && !error && (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--muted)' }}>
                  No subfolders
                </div>
              )}
              {state.dirs.map(dir => {
                const fullPath = `${state.path.replace(/[\\/]$/, '')}\\${dir}`;
                return (
                  <div
                    key={dir}
                    onClick={() => void browseFolder(fullPath)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-colors hover:bg-[#22223a] text-[0.88rem]"
                    style={{ userSelect: 'none' }}
                  >
                    <span className="text-lg flex-shrink-0">📁</span>
                    <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{dir}</span>
                    <span className="text-[0.75rem] flex-shrink-0" style={{ color: 'var(--muted)' }}>›</span>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0 gap-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <span className="text-[0.8rem]" style={{ color: 'var(--muted)' }}>
            {state.type === 'folder'
              ? state.imageCount > 0
                ? `${state.imageCount} image${state.imageCount !== 1 ? 's' : ''} here`
                : 'No images in this folder'
              : ''}
          </span>
          <button
            type="button"
            disabled={!canSelect}
            onClick={() => { if (currentPath) onSelect(currentPath); }}
            className="rounded-xl px-5 py-2.5 text-[0.88rem] font-semibold text-white whitespace-nowrap transition-opacity disabled:opacity-35 disabled:cursor-not-allowed hover:enabled:opacity-90 active:enabled:scale-[0.97]"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none',
              cursor: canSelect ? 'pointer' : 'not-allowed',
            }}
          >
            Select this folder
          </button>
        </div>
      </div>
    </div>
  );
}
