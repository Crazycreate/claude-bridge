import { useEffect, useState } from 'react';
import { listCliSessions, listDirs, type CliSessionMeta, type DirListing } from '../lib/dirs';
import { MODELS } from '../lib/models';

interface Props {
  defaultCwd: string;
  onCreate: (cwd: string, resumeClaudeSessionId?: string, model?: string) => void;
  onClose: () => void;
}

/**
 * Modal for creating a session and choosing its working directory.
 * Also surfaces Claude CLI (terminal) sessions previously recorded in the
 * picked directory — the user can pick one to resume that conversation.
 */
export function NewSessionDialog({ defaultCwd, onCreate, onClose }: Props) {
  const [cwd, setCwd] = useState(defaultCwd);
  const [model, setModel] = useState('');
  const [listing, setListing] = useState<DirListing | null>(null);
  const [cliSessions, setCliSessions] = useState<CliSessionMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Debounced load: refresh the picker whenever the input settles.
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form
        className="modal-card modal-wide"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(cwd.trim() || defaultCwd, undefined, model || undefined);
        }}
      >
        <h3>新建会话</h3>
        <p>
          选择工作目录。Claude Code 会在此目录下启动；它能访问当前服务器用户可访问的任意文件。
        </p>

        <label className="modal-label">工作目录</label>
        <input
          className="modal-input"
          value={cwd}
          autoFocus
          spellCheck={false}
          autoCapitalize="off"
          placeholder={defaultCwd}
          onChange={(e) => setCwd(e.target.value)}
        />

        <label className="modal-label" style={{ marginTop: 12 }}>
          模型
        </label>
        <div className="model-chips">
          {MODELS.map((m) => (
            <button
              key={m.id || 'default'}
              type="button"
              className={`model-chip tier-${m.tier} ${model === m.id ? 'active' : ''}`}
              onClick={() => setModel(m.id)}
              title={m.hint}
            >
              <span className="model-chip-label">{m.label}</span>
              <span className="model-chip-hint">{m.hint}</span>
            </button>
          ))}
        </div>

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
              <h4 className="picker-col-title">
                📥 终端会话 {cliSessions.length > 0 && <span className="picker-count">{cliSessions.length}</span>}
              </h4>
            </header>
            <div className="picker-col-path">点击继续之前的对话</div>
            <div className="dir-list">
              {cliSessions.length === 0 && !loading && (
                <div className="dir-empty">（此目录无终端会话）</div>
              )}
              {cliSessions.slice(0, 30).map((s) => (
                <button
                  type="button"
                  key={s.sessionId}
                  className="cli-session"
                  onClick={() =>
                    onCreate(cwd.trim() || defaultCwd, s.sessionId, model || undefined)
                  }
                >
                  <div className="cli-session-title">{s.title}</div>
                  <div className="cli-session-meta">
                    {s.messages} 条 · {formatTime(s.lastActiveAt)}
                  </div>
                </button>
              ))}
              {cliSessions.length > 30 && (
                <div className="cli-sessions-more">还有 {cliSessions.length - 30} 条更早的…</div>
              )}
            </div>
          </section>
        </div>

        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="modal-create">
            新建空白会话
          </button>
        </div>
      </form>
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
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
