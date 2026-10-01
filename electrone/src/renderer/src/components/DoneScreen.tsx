import { useEffect, useState } from 'react';
import { Check, Clock, FolderOpen, ListRestart, Loader2, Trash2 } from 'lucide-react';

import { apiDeleteCount, apiPurgeDeleted } from '../api';
import type { Stats } from '../types';
import { formatCount } from '../utils';
import { ConfirmDialog } from './Overlays';

interface Props {
  stats: Stats;
  error: string;
  /** Files still in the folder after applying, e.g. skipped ones. */
  remaining: number;
  onReviewRemaining: () => void;
  onChooseAnother: () => void;
}

export default function DoneScreen({ stats, error, remaining, onReviewRemaining, onChooseAnother }: Props) {
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const [deleteCount, setDeleteCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purged, setPurged] = useState<number | null>(null);
  const [purgeError, setPurgeError] = useState('');

  useEffect(() => {
    apiDeleteCount()
      .then(d => {
        setDeleteCount(d.count);
        if (Array.isArray(d.files)) setDeleteTargets(d.files);
      })
      .catch(() => {});
  }, []);

  async function purge() {
    setConfirming(false);
    setPurging(true);
    setPurgeError('');
    try {
      const result = await apiPurgeDeleted();
      setPurged(result.purged);
      setDeleteCount(0);
      setDeleteTargets([]);
    } catch (err) {
      setPurgeError(err instanceof Error ? err.message : 'Could not delete the files.');
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="screen">
      <div className="hero">
        <div className="hero-mark"><Check size={36} strokeWidth={2.2} /></div>
        <div>
          <h1>All sorted</h1>
          <p>Your decisions have been applied to the folder.</p>
        </div>

        <div className="stat-tiles">
          <div className="stat-tile">
            <span className="num">{formatCount(stats.kept)}</span>
            <span className="cap"><Check size={13} strokeWidth={2.4} /> Kept</span>
          </div>
          <div className="stat-tile">
            <span className="num">{formatCount(stats.later)}</span>
            <span className="cap"><Clock size={13} strokeWidth={2.2} /> Later</span>
          </div>
          <div className="stat-tile">
            <span className="num">{formatCount(stats.deleted)}</span>
            <span className="cap"><Trash2 size={13} strokeWidth={2.2} /> Deleted</span>
          </div>
        </div>

        {(error || purgeError) && <div className="notice" role="alert">{error || purgeError}</div>}

        <div className="hero-actions">
          <button type="button" className="btn btn--primary btn--large" onClick={onChooseAnother}>
            <FolderOpen size={18} strokeWidth={1.9} />
            Open another folder
          </button>
          {remaining > 0 && (
            <button type="button" className="btn btn--large" onClick={onReviewRemaining}>
              <ListRestart size={18} strokeWidth={1.9} />
              Review {formatCount(remaining)} remaining
            </button>
          )}
          {deleteCount > 0 && (
            <button type="button" className="btn btn--danger btn--large" onClick={() => setConfirming(true)} disabled={purging}>
              {purging ? <Loader2 size={17} className="spin" /> : <Trash2 size={17} strokeWidth={1.9} />}
              {purging ? 'Deleting…' : `Empty Delete folder (${formatCount(deleteCount)})`}
            </button>
          )}
          {purged !== null && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
              Permanently deleted {formatCount(purged)} {purged === 1 ? 'file' : 'files'}.
            </p>
          )}
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title={`Permanently delete ${formatCount(deleteCount)} ${deleteCount === 1 ? 'file' : 'files'}?`}
          confirmLabel="Delete permanently"
          danger
          onConfirm={() => void purge()}
          onCancel={() => setConfirming(false)}
        >
          <p>Files in the <strong>_delete</strong> folder will be removed from disk. This cannot be undone.</p>
          {deleteTargets.length > 0 && (
            <ul>
              {deleteTargets.slice(0, 50).map(name => <li key={name}>{name}</li>)}
              {deleteTargets.length > 50 && <li>…and {formatCount(deleteTargets.length - 50)} more</li>}
            </ul>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
