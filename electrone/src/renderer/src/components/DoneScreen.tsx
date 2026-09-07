import { useEffect, useState } from 'react';
import { CheckCircle2, Trash2, FolderOpen, Loader2 } from 'lucide-react';
import { apiDeleteCount, apiPurgeDeleted } from '../api';
import type { Stats } from '../types';

interface Props {
  stats: Stats;
  onChooseAnother: () => void;
}

export default function DoneScreen({ stats, onChooseAnother }: Props) {
  const [deleteCount, setDeleteCount] = useState(0);
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const [purged, setPurged] = useState(false);
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    apiDeleteCount()
      .then(d => {
        setDeleteCount(d.count);
        if (Array.isArray(d.files)) setDeleteTargets(d.files);
      })
      .catch(() => {});
  }, []);

  async function handlePurge() {
    const sampleList = deleteTargets.slice(0, 5).join('\n');
    const extra = deleteTargets.length > 5 ? `\n...and ${deleteTargets.length - 5} more` : '';
    const promptMessage = deleteTargets.length > 0
      ? `Permanently delete ${deleteCount} media file(s)?\n\nTarget files:\n${sampleList}${extra}\n\nThis cannot be undone.`
      : `Permanently delete ${deleteCount} media file(s)? This cannot be undone.`;

    if (!confirm(promptMessage)) return;
    setPurging(true);
    try {
      await apiPurgeDeleted();
      setDeleteCount(0);
      setDeleteTargets([]);
      setPurged(true);
    } catch { /* ignore */ }
    finally { setPurging(false); }
  }

  return (
    <div
      className="flex flex-col items-center gap-5 p-8 text-center"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        minWidth: '280px',
      }}
    >
      <CheckCircle2 size={40} style={{ color: 'var(--keep)' }} strokeWidth={1.5} />

      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>All done</h2>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {stats.kept} kept &middot; {stats.later} later &middot; {stats.deleted} deleted
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full">
        {deleteCount > 0 && !purged && (
          <button
            type="button"
            onClick={() => void handlePurge()}
            disabled={purging}
            className="flex items-center justify-center gap-2 w-full py-2 text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              background: '#3b0a14',
              border: '1px solid #7f1d1d',
              borderRadius: 'var(--radius)',
              color: '#fca5a5',
              cursor: purging ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={e => { if (!purging) e.currentTarget.style.background = '#4c0a19'; }}
            onMouseLeave={e => { if (!purging) e.currentTarget.style.background = '#3b0a14'; }}
          >
            {purging
              ? <><Loader2 size={14} className="animate-spin" /><span>Deleting…</span></>
              : <><Trash2 size={14} strokeWidth={1.8} /><span>Permanently delete {deleteCount} files</span></>
            }
          </button>
        )}

        <button
          type="button"
          onClick={onChooseAnother}
          className="flex items-center justify-center gap-2 w-full py-2 text-sm font-medium transition-colors"
          style={{
            background: '#065f46',
            border: '1px solid #10b981',
            borderRadius: 'var(--radius)',
            color: '#d1fae5',
            cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#047857'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#065f46'; }}
        >
          <FolderOpen size={14} strokeWidth={1.8} />
          <span>Choose another folder</span>
        </button>
      </div>
    </div>
  );
}
