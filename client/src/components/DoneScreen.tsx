import { useEffect, useState } from 'react';
import { apiDeleteCount, apiPurgeDeleted } from '../api';
import type { Stats } from '../types';

interface Props {
  stats: Stats;
  onChooseAnother: () => void;
}

export default function DoneScreen({ stats, onChooseAnother }: Props) {
  const [deleteCount, setDeleteCount] = useState(0);
  const [purged, setPurged] = useState(false);

  useEffect(() => {
    apiDeleteCount()
      .then(d => setDeleteCount(d.count))
      .catch(() => {});
  }, []);

  async function handlePurge() {
    if (!confirm(`Permanently delete ${deleteCount} file(s)? This cannot be undone.`)) return;
    try {
      await apiPurgeDeleted();
      setDeleteCount(0);
      setPurged(true);
    } catch {
      // ignore
    }
  }

  return (
    <div className="text-center p-10">
      <div className="text-6xl mb-4" style={{ color: 'var(--keep)' }}>✓</div>
      <h2 className="text-3xl font-semibold mb-2.5">All done!</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
        {stats.kept} → _keep · {stats.later} → _later · {stats.deleted} → _delete
      </p>
      <div className="flex flex-col items-center gap-2.5">
        {deleteCount > 0 && !purged && (
          <button
            type="button"
            onClick={() => void handlePurge()}
            className="rounded-xl px-7 py-3 text-[0.95rem] font-semibold text-white transition-opacity hover:opacity-85 active:scale-[0.97]"
            style={{ background: 'linear-gradient(135deg, #7f1d1d, #ef4444)', border: 'none', cursor: 'pointer' }}
          >
            🗑 Permanently delete {deleteCount} files
          </button>
        )}
        <button
          type="button"
          onClick={onChooseAnother}
          className="rounded-xl px-7 py-3 text-[1rem] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', cursor: 'pointer' }}
        >
          Choose another folder
        </button>
      </div>
    </div>
  );
}
