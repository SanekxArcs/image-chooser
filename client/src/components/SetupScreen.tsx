import { useState, useRef } from 'react';
import { apiSetFolder } from '../api';
import BrowserModal from './BrowserModal';

interface Props {
  onFolderSelected: (folder: string) => void;
}

export default function SetupScreen({ onFolderSelected }: Props) {
  const [folderValue, setFolderValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function startSession(folder: string) {
    const trimmed = folder.trim();
    if (!trimmed) {
      setError('Please enter a folder path.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await apiSetFolder(trimmed);
      if (data.total === 0) {
        setError('No images found in that folder.');
        return;
      }
      onFolderSelected(trimmed);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not connect to server.');
    } finally {
      setLoading(false);
    }
  }

  function handleBrowserSelect(path: string) {
    setFolderValue(path);
    setBrowserOpen(false);
    void startSession(path);
  }

  return (
    <>
      <div
        className="flex items-center justify-center w-full h-screen"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, #1e1b4b 0%, var(--bg) 70%)' }}
      >
        <div
          className="w-[90%] max-w-[520px] text-center rounded-2xl p-12"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          }}
        >
          <h1
            className="text-4xl font-bold mb-1.5"
            style={{
              background: 'linear-gradient(135deg, #818cf8, #c084fc)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Image Chooser
          </h1>
          <p className="text-sm mb-8" style={{ color: 'var(--muted)' }}>
            Tinder for your images
          </p>

          <div className="flex gap-2.5 mb-3">
            <input
              ref={inputRef}
              type="text"
              value={folderValue}
              onChange={e => setFolderValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void startSession(folderValue); }}
              placeholder="Paste a path, or click Browse…"
              className="flex-1 rounded-xl text-sm px-3.5 py-3 outline-none transition-colors"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#818cf8'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--border)'; }}
            />
            <button
              type="button"
              onClick={() => setBrowserOpen(true)}
              className="rounded-xl px-5 py-3 text-sm font-semibold whitespace-nowrap transition-opacity hover:opacity-90 active:scale-[0.97]"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
            >
              Browse
            </button>
            <button
              type="button"
              onClick={() => void startSession(folderValue)}
              disabled={loading}
              className="rounded-xl px-5 py-3 text-sm font-semibold whitespace-nowrap text-white transition-opacity hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none' }}
            >
              {loading ? 'Loading…' : 'Start'}
            </button>
          </div>

          <p
            className="text-[0.82rem] min-h-[18px] mb-6"
            style={{ color: 'var(--delete)' }}
          >
            {error}
          </p>

          <div className="flex justify-center gap-4 flex-wrap text-[0.78rem]" style={{ color: 'var(--muted)' }}>
            <span>Keep → do nothing</span>
            <span>Later → move to _later folder</span>
            <span>Delete → permanently delete</span>
          </div>
        </div>
      </div>

      {browserOpen && (
        <BrowserModal
          onSelect={handleBrowserSelect}
          onClose={() => setBrowserOpen(false)}
        />
      )}
    </>
  );
}
