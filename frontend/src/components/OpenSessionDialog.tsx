import { useEffect, useState } from 'react';
import type { ClaudeState, SessionMeta } from '@mobileai/shared';
import { listCliSessions, listDirs, type CliSessionMeta, type DirListing } from '../lib/dirs';

interface Props {
  defaultCwd: string;
  /** Every session this app already knows about — filtered by directory here. */
  bridgeSessions: SessionMeta[];
  onClose: () => void;
  /** Open an existing app session (switch to it). */
  onOpenBridge: (id: string) => void;
  /** Resume a terminal Claude session as a new app session. */
  onOpenCli: (cwd: string, sessionId: string) => void;
}

const STATE_LABEL: Record<ClaudeState, string> = {
  dormant: '休眠',
  starting: '启动中',
  ready: '就绪',
  busy: '运行中',
  idle: '空闲',
};

/**
 * Modal for re-opening a past conversation. The user browses to a directory
 * and sees every prior conversation rooted there — both this app's own
 * sessions and Claude CLI (terminal) sessions — then clicks one to open it.
 */
export function OpenSessionDialog({
  defaultCwd,
  bridgeSessions,
  onClose,
  onOpenBridge,
  onOpenCli,
}: Props) {
  const [cwd, setCwd] = useState(defaultCwd);
  const [listing, setListing] = useState<DirListing | null>(null);
  const [cliSessions, setCliSessions] = useState<CliSessionMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Debounced load: refresh the browser whenever the path input settles.
  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      const target = cwd.trim() || defaultCwd;
      Promise.all([
        listDirs(target).then(setListing),
        listCliSessions(target)
          .then(setCliSessions)
          .catch(() => setCliSessions([])),
      ])
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
          setListing(null);
          setCliSessions([]);
        })
        .finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(handle);
  }, [cwd, defaultCwd]);

  const goTo = (path: string): void => setCwd(path);

  // App sessions rooted in the directory currently being browsed. We match on
  // the server-normalised path so trailing slashes etc. never cause misses.
  const resolvedPath = listing?.path ?? (cwd.trim() || defaultCwd);
  const matchingBridge = bridgeSessions.filter((s) => s.cwd === resolvedPath);
  const empty = !loading && matchingBridge.length === 0 && cliSessions.length === 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>打开历史对话</h3>
        <p>选择一个目录,查看该目录下之前的对话 —— 既包括本应用的会话,也包括终端里跑过的 Claude 会话。点击任意一条直接打开。</p>

        <label className="modal-label">目录</label>
        <input
          className="modal-input"
          value={cwd}
          autoFocus
          spellCheck={false}
          autoCapitalize="off"
          placeholder={defaultCwd}
          onChange={(e) => setCwd(e.target.value)}
        />

        <div className="picker-grid">
          <section className="picker-col">
            <header className="picker-col-head">
              <button
                type="button"
                className="dir-up"
                disabled={!listing?.parent}
                onClick={() => listing?.parent && goTo(listing.parent)}
                title="上一级"
              >
                ↑
              </button>
              <h4 className="picker-col-title">📁 子目录</h4>
              {loading && <span className="dir-loading">…</span>}
            </header>
            <div className="picker-col-path" title={listing?.path}>
              {listing?.path ?? '…'}
            </div>
            <div className="dir-list">
              {error && <div className="dir-error">{error}</div>}
              {!error && listing && listing.entries.length === 0 && (
                <div className="dir-empty">（没有子目录）</div>
              )}
              {!error &&
                listing?.entries.map((name) => (
                  <button
                    type="button"
                    key={name}
                    className="dir-entry"
                    onClick={() => goTo(joinPath(listing.path, name))}
                  >
                    <span className="dir-icon">📁</span>
                    <span className="dir-name">{name}</span>
                  </button>
                ))}
            </div>
          </section>

          <section className="picker-col">
            <header className="picker-col-head">
              <h4 className="picker-col-title">💬 该目录的对话</h4>
            </header>
            <div className="picker-col-path">本应用会话 + 终端会话</div>
            <div className="dir-list">
              {empty && <div className="dir-empty">（此目录暂无历史对话）</div>}

              {matchingBridge.length > 0 && <div className="open-group">本应用会话</div>}
              {matchingBridge.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className="cli-session"
                  onClick={() => onOpenBridge(s.id)}
                >
                  <div className="cli-session-title">{s.title}</div>
                  <div className="cli-session-meta">
                    {STATE_LABEL[s.state]} · {formatTime(s.createdAt)}
                  </div>
                </button>
              ))}

              {cliSessions.length > 0 && <div className="open-group">终端会话</div>}
              {cliSessions.slice(0, 40).map((s) => (
                <button
                  type="button"
                  key={s.sessionId}
                  className="cli-session"
                  onClick={() => onOpenCli(resolvedPath, s.sessionId)}
                >
                  <div className="cli-session-title">{s.title}</div>
                  <div className="cli-session-meta">
                    {s.messages} 条 · {formatTime(s.lastActiveAt)}
                  </div>
                </button>
              ))}
              {cliSessions.length > 40 && (
                <div className="cli-sessions-more">还有 {cliSessions.length - 40} 条更早的…</div>
              )}
            </div>
          </section>
        </div>

        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

/** POSIX path join — the server reports absolute POSIX paths. */
function joinPath(base: string, child: string): string {
  return base.endsWith('/') ? `${base}${child}` : `${base}/${child}`;
}

/** "今天 14:32" / "5月18日" — coarse, for inline meta lines. */
function formatTime(at: number): string {
  const d = new Date(at);
  const sameDay = d.toDateString() === new Date().toDateString();
  if (sameDay) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
