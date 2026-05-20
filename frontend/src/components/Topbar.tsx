import type { ClaudeState } from '@mobileai/shared';
import type { GitStatus } from '../hooks/useGitStatus';
import { MODELS, modelLabel } from '../lib/models';

interface Props {
  title: string;
  cwd?: string;
  status: ClaudeState | null;
  model: string;
  git: GitStatus | null;
  onMenu: () => void;
  onInterrupt: () => void;
  onModelChange: (model: string) => void;
}

const STATE_LABEL: Record<NonNullable<Props['status']>, string> = {
  dormant: '休眠 · 发消息唤醒',
  starting: '启动中…',
  ready: '就绪',
  busy: 'busy',
  idle: '空闲',
};
function labelFor(status: ClaudeState | null): string {
  return status ? STATE_LABEL[status] : '—';
}

/** Trim a long absolute path to just the last two segments. */
function shortCwd(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean);
  if (parts.length <= 2) return `/${parts.join('/')}`;
  return `…/${parts.slice(-2).join('/')}`;
}

/** Header of the main column: drawer toggle, title, cwd, git, model, run state. */
export function Topbar({
  title,
  cwd,
  status,
  model,
  git,
  onMenu,
  onInterrupt,
  onModelChange,
}: Props) {
  return (
    <div className="topbar">
      <button className="hamburger" onClick={onMenu} aria-label="打开侧边栏">
        ☰
      </button>
      <div className="topbar-info">
        <div className="topbar-title">{title}</div>
        <div className="topbar-meta">
          {cwd && (
            <span className="topbar-cwd" title={cwd}>
              📁 {shortCwd(cwd)}
            </span>
          )}
          {git?.isRepo && (
            <span className="git-pill" title={`${git.branch}${gitTooltip(git)}`}>
              <span className="git-dot" />
              {git.branch}
              {git.dirty != null && git.dirty > 0 && (
                <span className="git-dirty"> ·{git.dirty}</span>
              )}
              {(git.ahead || 0) > 0 && <span className="git-ahead">↑{git.ahead}</span>}
              {(git.behind || 0) > 0 && <span className="git-behind">↓{git.behind}</span>}
            </span>
          )}
        </div>
      </div>

      <div className="topbar-right">
        <ModelSelect value={model} onChange={onModelChange} />
        {status === 'busy' ? (
          <button className="topbar-stop" onClick={onInterrupt}>
            停止
          </button>
        ) : (
          <span className="topbar-state">{labelFor(status)}</span>
        )}
      </div>
    </div>
  );
}

function gitTooltip(g: GitStatus): string {
  const parts: string[] = [];
  if (g.dirty) parts.push(`${g.dirty} dirty`);
  if (g.ahead) parts.push(`${g.ahead} ahead`);
  if (g.behind) parts.push(`${g.behind} behind`);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

function ModelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="model-select-wrap" title={`当前模型:${modelLabel(value)}`}>
      <select
        className="model-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {MODELS.map((m) => (
          <option key={m.id || 'default'} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
