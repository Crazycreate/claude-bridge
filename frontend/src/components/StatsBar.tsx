import type { Stats } from '../hooks/useBridge';

/** Slim footer showing turn count, last turn duration, and accrued cost. */
export function StatsBar({ stats }: { stats: Stats }) {
  return (
    <div className="stats-bar">
      <div className="stat">
        <span className="k">轮次</span>
        <span className="v">{stats.turns}</span>
      </div>
      <div className="stat-sep" />
      <div className="stat">
        <span className="k">上次</span>
        <span className="v">{stats.lastMs ? `${(stats.lastMs / 1000).toFixed(1)}s` : '—'}</span>
      </div>
      <div className="stat-sep" />
      <div className="stat">
        <span className="k">累计费用</span>
        <span className="v cost">${stats.cost.toFixed(4)}</span>
      </div>
    </div>
  );
}
