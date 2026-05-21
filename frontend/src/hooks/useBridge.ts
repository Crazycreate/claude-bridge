import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ClaudeState,
  ClientMessage,
  PermissionDecision,
  ServerMessage,
  SessionMeta,
} from '@mobileai/shared';
import { applyServerMessage, type TimelineItem } from '../lib/timeline';
import { wsUrl } from '../lib/server';

export type ConnState = 'connecting' | 'online' | 'offline';

export interface Stats {
  cost: number;
  lastMs: number;
  turns: number;
}

const EMPTY_STATS: Stats = { cost: 0, lastMs: 0, turns: 0 };
const RECONNECT_MS = 1500;

export interface Bridge {
  conn: ConnState;
  authError: boolean;
  sessions: SessionMeta[];
  activeId: string | null;
  claudeStatus: ClaudeState | null;
  defaultCwd: string;
  items: TimelineItem[];
  /** True while a session switch is in flight — select sent, history not loaded yet. */
  switching: boolean;
  stats: Stats;
  sendPrompt: (text: string) => void;
  sendPermission: (id: string, decision: PermissionDecision) => void;
  interrupt: () => void;
  newSession: (cwd?: string, resumeClaudeSessionId?: string, model?: string) => void;
  setModel: (model: string) => void;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
}

/**
 * Owns the WebSocket connection to the bridge server: authenticates,
 * auto-reconnects, tracks every session, and folds the active session's
 * stream into a timeline. Passing `token = null` keeps the hook idle.
 */
export function useBridge(token: string | null): Bridge {
  const [conn, setConn] = useState<ConnState>('offline');
  const [authError, setAuthError] = useState(false);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [defaultCwd, setDefaultCwd] = useState('');
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [switching, setSwitching] = useState(false);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);

  const wsRef = useRef<WebSocket | null>(null);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setAuthError(false);

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = (): void => {
      if (disposed) return;
      setConn('connecting');
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token } satisfies ClientMessage));

      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(ev.data)) as ServerMessage;
        } catch {
          return;
        }
        switch (msg.type) {
          case 'auth_ok':
            setConn('online');
            setDefaultCwd(msg.defaultCwd);
            // Force the next `sessions` message to reset the timeline.
            activeIdRef.current = null;
            setItems([]);
            return;
          case 'auth_error':
            setAuthError(true);
            disposed = true;
            ws.close();
            return;
          case 'sessions':
            setSessions(msg.list);
            if (msg.activeId !== activeIdRef.current) {
              activeIdRef.current = msg.activeId;
              setActiveId(msg.activeId);
              setItems([]);
              setStats(EMPTY_STATS);
            }
            // The server has acknowledged the switch; history follows in the
            // same burst, so it is safe to drop the loading spinner now.
            setSwitching(false);
            return;
          case 'status':
            return; // session state is derived from the `sessions` list
          case 'result':
            setStats((s) => ({
              cost: s.cost + msg.costUsd,
              lastMs: msg.durationMs,
              turns: s.turns + 1,
            }));
            setItems((prev) => applyServerMessage(prev, msg));
            return;
          default:
            setItems((prev) => applyServerMessage(prev, msg));
        }
      };

      ws.onerror = () => ws.close();
      ws.onclose = () => {
        // Only clear the ref if this socket is still the active one.
        // In StrictMode the first effect's onclose can fire *after* a second
        // socket has taken its place — without this guard it would null out
        // the live socket and silently swallow every later send.
        if (wsRef.current === ws) wsRef.current = null;
        if (disposed) return;
        setConn('offline');
        reconnectTimer = setTimeout(connect, RECONNECT_MS);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const ws = wsRef.current;
      wsRef.current = null;
      if (!ws) return;
      // Detach handlers so the eventual `close` event does not race against
      // the next effect's freshly-opened socket.
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.CONNECTING) {
        // Closing a CONNECTING socket triggers a noisy browser warning that
        // we cannot intercept. Wait for the handshake, then close quietly —
        // this matters only in dev under StrictMode's double-invoke.
        ws.onopen = () => ws.close();
      } else {
        ws.onopen = null;
        ws.close();
      }
    };
  }, [token]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const claudeStatus = useMemo<ClaudeState | null>(
    () => sessions.find((s) => s.id === activeId)?.state ?? null,
    [sessions, activeId],
  );

  return {
    conn,
    authError,
    sessions,
    activeId,
    claudeStatus,
    defaultCwd,
    items,
    switching,
    stats,
    sendPrompt: useCallback(
      (text: string) => {
        if (text.trim()) send({ type: 'prompt', text });
      },
      [send],
    ),
    sendPermission: useCallback(
      (id: string, decision: PermissionDecision) => send({ type: 'permission', id, decision }),
      [send],
    ),
    interrupt: useCallback(() => send({ type: 'interrupt' }), [send]),
    newSession: useCallback(
      (cwd?: string, resumeClaudeSessionId?: string, model?: string) => {
        const msg: ClientMessage = { type: 'new_session' };
        if (cwd) msg.cwd = cwd;
        if (resumeClaudeSessionId) msg.resumeClaudeSessionId = resumeClaudeSessionId;
        if (model) msg.model = model;
        send(msg);
      },
      [send],
    ),
    setModel: useCallback((model: string) => send({ type: 'set_model', model }), [send]),
    selectSession: useCallback(
      (id: string) => {
        if (id !== activeIdRef.current) {
          setSwitching(true);
          // Safety net: never strand the spinner if the server stays silent.
          window.setTimeout(() => setSwitching(false), 5000);
        }
        send({ type: 'select_session', id });
      },
      [send],
    ),
    deleteSession: useCallback((id: string) => send({ type: 'delete_session', id }), [send]),
    renameSession: useCallback(
      (id: string, title: string) => send({ type: 'rename_session', id, title }),
      [send],
    ),
  };
}
