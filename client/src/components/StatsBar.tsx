import type { Stats } from '../types';

interface Props {
  stats: Stats;
}

export default function StatsBar({ stats }: Props) {
  return (
    <div className="flex justify-center gap-6 py-1 flex-shrink-0">
      <span className="flex items-center gap-1.5 text-[0.82rem] font-semibold" style={{ color: 'var(--keep)' }}>
        <span>✓</span>
        <span>{stats.kept}</span>
      </span>
      <span className="flex items-center gap-1.5 text-[0.82rem] font-semibold" style={{ color: 'var(--later)' }}>
        <span>🕐</span>
        <span>{stats.later}</span>
      </span>
      <span className="flex items-center gap-1.5 text-[0.82rem] font-semibold" style={{ color: 'var(--delete)' }}>
        <span>🗑</span>
        <span>{stats.deleted}</span>
      </span>
    </div>
  );
}
