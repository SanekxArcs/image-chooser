import { Check, Clock, Trash2 } from 'lucide-react';
import type { Stats } from '../types';

interface Props {
  stats: Stats;
}

export default function StatsBar({ stats }: Props) {
  return (
    <div className="flex justify-center gap-5 py-1 flex-shrink-0">
      <span className="flex items-center gap-1.5 text-xs font-medium tabular-nums" style={{ color: 'var(--keep)' }}>
        <Check size={13} strokeWidth={2.5} />
        <span>{stats.kept}</span>
      </span>
      <span className="flex items-center gap-1.5 text-xs font-medium tabular-nums" style={{ color: 'var(--later)' }}>
        <Clock size={13} strokeWidth={2.5} />
        <span>{stats.later}</span>
      </span>
      <span className="flex items-center gap-1.5 text-xs font-medium tabular-nums" style={{ color: 'var(--delete)' }}>
        <Trash2 size={13} strokeWidth={2.5} />
        <span>{stats.deleted}</span>
      </span>
    </div>
  );
}
