import { useEffect, useState } from 'react';
import type { ClaudeState, SessionMeta } from '@mobileai/shared';
import {
  deleteCliSession,
  hideCliSession,
  listCliSessions,
  listDirs,
  type CliSessionMeta,
  type DirListing,
} from '../lib/dirs';

interface Props {
  defaultCwd: string;
  /** Every session this app already knows about — filtered by directory here. */
  bridgeSessions: SessionMeta[];
  onClose: () => void;
  /** Open an existing app session (switch to it). */
  onOpenBridge: (id: string) => void;
  /** Resume a terminal Claude session as a new app session. */
  onOpenCli: (cwd: string, sessionId: string) => void;
  /** Delete an app session (removes it from this app and from disk). */
  onDeleteBridge: (id: string) => void;
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
 * Each row can also be removed: app sessions are deleted; terminal sessions
 * can be hidden (kept on disk) or permanently deleted.
 */
export function OpenSessionDialog({
  defaultCwd,
  bridgeSessions,
  onClose,
  onOpenBridge,
  onOpenCli,
  onDeleteBridge,
}: Props) {
  const [cwd, setCwd] = useState(defaultCwd);
  const [listing, setListing] = useState<DirListing | null>(null);
  const [cliSessions, setCliSessions] = useState<CliSessionMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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

  const hideCli = async (s: CliSessionMeta): Promise<void> => {
    setActionError(null);
    try {
      await hideCliSession(s.sessionId);
      setCliSessions((prev) => prev.filter((x) => x.sessionId !== s.sessionId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const deleteCli = async (s: CliSessionMeta): Promise<void> => {
    if (
      !confirm(
        `彻底删除终端会话「${s.title}」?\n\n` +
          `这会从 ~/.claude/projects 删除原始记录,不可恢复 —— ` +
          `你在终端 claude --resume 也将再也找不到它。`,
      )
    ) {
      return;
    }
    setActionError(null);
    try {
      await deleteCliSession(resolvedPath, s.sessionId);
      setCliSessions((prev) => prev.filter((x) => x.sessionId !== s.sessionId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const deleteBridge = (s: SessionMeta): void => {
    if (!confirm(`删除会话「${s.title}」?\n\n这会删除本应用里的这条会话记录。`)) return;
    onDeleteBridge(s.id);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>打开历史对话</h3>
        <p>选择一个目录,查看该目录下之前的对话 —— 既包括本应用的会话,也包括终端里跑过的 Claude 会话。点标题打开,点右侧按钮删除。</p>

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

        {actionError && <div className="dir-error" style={{ marginTop: 8 }}>{actionError}</div>}

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
                <div className="hist-item" key={s.id}>
                  <button className="cli-session" onClick={() => onOpenBridge(s.id)}>
                    <div className="cli-session-title">{s.title}</div>
                    <div className="cli-session-meta">
                      {STATE_LABEL[s.state]} · {formatTime(s.createdAt)}
                    </div>
                  </button>
                  <div className="hist-actions">
                    <button
                      type="button"
                      className="hist-act danger"
                      title="删除此会话"
                      onClick={() => deleteBridge(s)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}

              {cliSessions.length > 0 && <div className="open-group">终端会话</div>}
              {cliSessions.slice(0, 40).map((s) => (
                <div className="hist-item" key={s.sessionId}>
                  <button
                    className="cli-session"
                    onClick={() => onOpenCli(resolvedPath, s.sessionId)}
                  >
                    <div className="cli-session-title">{s.title}</div>
                    <div className="cli-session-meta">
                      {s.messages} 条 · {formatTime(s.lastActiveAt)}
                    </div>
                  </button>
                  <div className="hist-actions">
                    <button
                      type="button"
                      className="hist-act"
                      title="从列表隐藏(不删原始记录)"
                      onClick={() => void hideCli(s)}
                    >
                      隐藏
                    </button>
                    <button
                      type="button"
                      className="hist-act danger"
                      title="彻底删除终端记录(不可恢复)"
                      onClick={() => void deleteCli(s)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
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
