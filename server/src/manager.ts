import { randomUUID } from 'node:crypto';
import type { HistoryEntry, ServerMessage, SessionMeta } from '@mobileai/shared';
import { ClaudeSession } from './session.js';
import { SessionStore } from './store.js';
import { push, type PushPayload } from './push.js';
import { classifyUserText } from './cli-history.js';

/**
 * Re-run the system-injection filter over a persisted history. Sessions
 * imported before that filter existed have raw `<local-command-caveat>` etc.
 * baked into their `user_echo` messages — this scrubs them on load.
 */
function cleanupHistory(history: HistoryEntry[]): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const entry of history) {
    if (entry.msg.type === 'user_echo') {
      const c = classifyUserText(entry.msg.text);
      if (c.kind === 'skip') continue;
      out.push({ at: entry.at, msg: { type: 'user_echo', text: c.text } });
    } else {
      out.push(entry);
    }
  }
  return out;
}

/** First real user message in a history — used to re-title scrubbed sessions. */
function firstUserEcho(history: HistoryEntry[]): string | null {
  for (const entry of history) {
    if (entry.msg.type === 'user_echo' && entry.msg.text.trim()) return entry.msg.text;
  }
  return null;
}

/**
 * Translate a session message into a push notification when it deserves
 * interrupting the user (Claude is asking permission, a turn finished, or
 * something errored). Returns null for routine status/history chatter.
 */
function buildPushPayload(session: ClaudeSession, msg: ServerMessage): PushPayload | null {
  const titlePrefix = session.title.length > 30 ? session.title.slice(0, 30) + '…' : session.title;
  switch (msg.type) {
    case 'permission_request':
      return {
        title: `🔐 ${msg.toolName} 待批准`,
        body: `[${titlePrefix}] Claude 需要你的许可才能继续`,
        tag: `perm-${session.id}`,
        url: `/?session=${session.id}`,
      };
    case 'result': {
      if (msg.isError) {
        return {
          title: `❌ 一次回合失败`,
          body: `[${titlePrefix}] ${msg.subtype}`,
          tag: `result-${session.id}`,
        };
      }
      // Only push for turns that took long enough to be worth waiting on
      if (msg.durationMs >= 12_000) {
        return {
          title: `✓ Claude 完成回合`,
          body: `[${titlePrefix}] ${(msg.durationMs / 1000).toFixed(0)}s · $${msg.costUsd.toFixed(3)}`,
          tag: `result-${session.id}`,
        };
      }
      return null;
    }
    case 'error':
      return {
        title: `⚠️ 出错了`,
        body: `[${titlePrefix}] ${msg.message.slice(0, 120)}`,
        tag: `err-${session.id}`,
      };
    default:
      return null;
  }
}

export interface CreateOptions {
  cwd?: string;
  /**
   * Existing Claude CLI session id to resume. When set, the new session
   * starts with this id so the SDK reloads the original conversation, and
   * optional `history` is replayed in the bridge UI.
   */
  resumeClaudeSessionId?: string;
  history?: HistoryEntry[];
  title?: string;
  model?: string;
}

interface ManagerOptions {
  cwd: string;
  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
}

const SAVE_DEBOUNCE_MS = 300;

/**
 * Holds every live Claude Code session and notifies subscribers
 * whenever the set of sessions — or any session's metadata — changes.
 * Sessions are persisted to disk so the sidebar survives bridge restarts.
 */
export class SessionManager {
  private readonly sessions = new Map<string, ClaudeSession>();
  /** Session ids, most-recently-active first (active = newest createdAt or touched). */
  private readonly order: string[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly store = new SessionStore();
  /** Pending save timers per session id, for write coalescing. */
  private readonly saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly opts: ManagerOptions) {
    // Hydrate dormant sessions from disk so the sidebar shows history at boot.
    const persisted = this.store.loadAll().sort((a, b) => b.createdAt - a.createdAt);
    for (const p of persisted) {
      const history = cleanupHistory(p.history);
      // Re-title sessions whose stored title is a leftover system injection.
      let title = p.title;
      if (!title || title.startsWith('<') || title === 'New chat' || title === '终端会话') {
        const ft = firstUserEcho(history);
        if (ft) title = ft.slice(0, 80);
      }
      const session = new ClaudeSession({
        id: p.id,
        cwd: p.cwd,
        permissionMode: opts.permissionMode,
        onMeta: () => this.notify(),
        onHistory: () => this.scheduleSave(p.id),
        onEmit: (m) => this.pushIfRelevant(p.id, m),
        initial: {
          title,
          createdAt: p.createdAt,
          claudeSessionId: p.claudeSessionId,
          history,
          model: p.model,
        },
      });
      this.sessions.set(p.id, session);
      this.order.push(p.id);
    }
  }

  /** The configured default working directory for new sessions. */
  get defaultCwd(): string {
    return this.opts.cwd;
  }

  /** Subscribe to "session list or metadata changed" events. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  create(input: string | CreateOptions = this.opts.cwd): ClaudeSession {
    const opts: CreateOptions = typeof input === 'string' ? { cwd: input } : input;
    const id = randomUUID();
    const session = new ClaudeSession({
      id,
      cwd: opts.cwd ?? this.opts.cwd,
      permissionMode: this.opts.permissionMode,
      onMeta: () => this.notify(),
      onHistory: () => this.scheduleSave(id),
      onEmit: (m) => this.pushIfRelevant(id, m),
      initial: {
        title: opts.title,
        claudeSessionId: opts.resumeClaudeSessionId ?? null,
        history: opts.history,
        model: opts.model,
      },
    });
    // Fresh sessions start eagerly — the user explicitly asked for one.
    session.start();
    this.sessions.set(id, session);
    this.order.unshift(id);
    this.scheduleSave(id);
    this.notify();
    return session;
  }

  get(id: string): ClaudeSession | undefined {
    return this.sessions.get(id);
  }

  delete(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.close();
    this.sessions.delete(id);
    const idx = this.order.indexOf(id);
    if (idx >= 0) this.order.splice(idx, 1);
    const timer = this.saveTimers.get(id);
    if (timer) clearTimeout(timer);
    this.saveTimers.delete(id);
    this.store.delete(id);
    this.notify();
  }

  list(): SessionMeta[] {
    return this.order
      .map((id) => this.sessions.get(id)?.meta())
      .filter((m): m is SessionMeta => m != null);
  }

  /** The most-recently-created session, if any. */
  latest(): ClaudeSession | undefined {
    return this.order.length > 0 ? this.sessions.get(this.order[0]) : undefined;
  }

  closeAll(): void {
    // Flush any pending saves before exit so we never drop the last turn.
    for (const [id, timer] of this.saveTimers) {
      clearTimeout(timer);
      this.saveNow(id);
    }
    this.saveTimers.clear();
    for (const session of this.sessions.values()) session.close();
  }

  private scheduleSave(id: string): void {
    const existing = this.saveTimers.get(id);
    if (existing) clearTimeout(existing);
    this.saveTimers.set(
      id,
      setTimeout(() => {
        this.saveTimers.delete(id);
        this.saveNow(id);
      }, SAVE_DEBOUNCE_MS),
    );
  }

  private saveNow(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    try {
      this.store.save(session.snapshot());
    } catch (err) {
      console.error(`[manager] save failed for ${id}:`, err);
    }
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        /* a dead listener must not break the others */
      }
    }
  }

  private pushIfRelevant(id: string, msg: ServerMessage): void {
    const session = this.sessions.get(id);
    if (!session) return;
    const payload = buildPushPayload(session, msg);
    if (payload) void push.notify(payload);
  }
}
