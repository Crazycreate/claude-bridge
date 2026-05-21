import { useMemo, useState } from 'react';
import type { SessionMeta } from '@mobileai/shared';
import type { ConnState } from '../hooks/useBridge';
import { MODELS } from '../lib/models';
import { PushToggle } from './PushToggle';

interface Props {
  sessions: SessionMeta[];
  activeId: string | null;
  conn: ConnState;
  open: boolean;
  /** Active session's model id; `undefined` when no session is selected. */
  model?: string;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onModelChange: (model: string) => void;
}

const CONN_LABEL: Record<ConnState, string> = {
  online: '已连接',
  connecting: '连接中…',
  offline: '已断开',
};

/** Left navigation: split into "活跃" (started) and "历史" (dormant) groups. */
export function Sidebar({
  sessions,
  activeId,
  conn,
  open,
  model,
  onClose,
  onNew,
  onSelect,
  onDelete,
  onRename,
  onModelChange,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const [query, setQuery] = useState('');
  const { active, history } = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (s: SessionMeta): boolean =>
      !needle || s.title.toLowerCase().includes(needle) || s.cwd.toLowerCase().includes(needle);
    const a: SessionMeta[] = [];
    const h: SessionMeta[] = [];
    for (const s of sessions) {
      if (!matches(s)) continue;
      (s.state === 'dormant' ? h : a).push(s);
    }
    return { active: a, history: h };
  }, [sessions, query]);

  const startRename = (s: SessionMeta): void => {
    setEditingId(s.id);
    setDraft(s.title);
  };
  const commitRename = (): void => {
    if (editingId && draft.trim()) onRename(editingId, draft.trim());
    setEditingId(null);
  };

  const renderItem = (s: SessionMeta) => (
    <div
      key={s.id}
      className={`session-item ${s.id === activeId ? 'active' : ''} ${s.state === 'dormant' ? 'dormant' : ''}`}
      onClick={() => onSelect(s.id)}
      title={s.cwd}
    >
      <span className={`session-dot ${s.state}`} />
      <div className="session-text">
        {editingId === s.id ? (
          <input
            className="session-rename"
            autoFocus
            value={draft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setEditingId(null);
            }}
          />
        ) : (
          <>
            <div className="session-name">{s.title}</div>
            <div className="session-sub">
              {shortCwd(s.cwd)} · {formatAge(s.createdAt)}
            </div>
          </>
        )}
      </div>
      {s.id === activeId && editingId !== s.id && (
        <div className="session-actions-row">
          <button
            className="session-del"
            title="重命名"
            onClick={(e) => {
              e.stopPropagation();
              startRename(s);
            }}
          >
            ✎
          </button>
          <button
            className="session-del"
            title="删除会话"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('删除此会话?(磁盘上的记录也会清除)')) onDelete(s.id);
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-header">
        <div className="logo">C</div>
        <span className="sidebar-title">Claude Bridge</span>
        <button className="close-drawer" onClick={onClose} aria-label="关闭侧边栏">
          ×
        </button>
      </div>

      <button className="new-chat-btn" onClick={onNew}>
        ＋ 新建会话
      </button>

      <div className="sidebar-search">
        <input
          className="sidebar-search-input"
          type="search"
          placeholder="搜索会话…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="sidebar-search-clear"
            aria-label="清空"
            onClick={() => setQuery('')}
          >
            ×
          </button>
        )}
      </div>

      <div className="session-list">
        {active.length > 0 && (
          <>
            <div className="session-group">活跃</div>
            {active.map(renderItem)}
          </>
        )}
        {history.length > 0 && (
          <>
            <div className="session-group">历史 · 点击继续</div>
            {history.map(renderItem)}
          </>
        )}
        {sessions.length === 0 && <div className="session-empty">还没有会话</div>}
        {sessions.length > 0 && active.length + history.length === 0 && (
          <div className="session-empty">没有匹配的会话</div>
        )}
      </div>

      {model !== undefined && (
        <div className="sidebar-model">
          <label className="sidebar-model-label" htmlFor="sidebar-model-select">
            模型
          </label>
          <div className="model-select-wrap sidebar-model-wrap">
            <select
              id="sidebar-model-select"
              className="model-select"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
            >
              {MODELS.map((m) => (
                <option key={m.id || 'default'} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <div className="conn-badge">
          <span className={`status-dot ${conn}`} />
          {CONN_LABEL[conn]} · {sessions.length} 会话
        </div>
        <PushToggle />
      </div>
    </aside>
  );
}

/** Trim a long absolute path to just the last two segments. */
function shortCwd(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean);
  if (parts.length <= 2) return cwd;
  return `…/${parts.slice(-2).join('/')}`;
}

/** "5分钟前" / "3小时前" / "5月18" — coarse, for sidebar density. */
function formatAge(at: number): string {
  const diffMs = Date.now() - at;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const date = new Date(at);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
