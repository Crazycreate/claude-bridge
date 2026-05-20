/**
 * Wire protocol between the mobile client and the bridge server.
 * Both directions are JSON objects with a `type` discriminator.
 * Shared by `server` and `frontend` so the two never drift apart.
 */

export type ClaudeState = 'dormant' | 'starting' | 'ready' | 'busy' | 'idle';

export type PermissionDecision = 'allow' | 'deny';

/** Lightweight description of one Claude Code session, shown in the sidebar. */
export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  state: ClaudeState;
  /** Absolute working directory the session operates in. */
  cwd: string;
  /** Anthropic model id (e.g. `claude-opus-4-7`); empty string = SDK default. */
  model: string;
}

/** Messages the client sends to the server. */
export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'new_session'; cwd?: string; resumeClaudeSessionId?: string; model?: string }
  | { type: 'select_session'; id: string }
  | { type: 'delete_session'; id: string }
  | { type: 'rename_session'; id: string; title: string }
  | { type: 'set_model'; model: string }
  | { type: 'prompt'; text: string }
  | { type: 'permission'; id: string; decision: PermissionDecision }
  | { type: 'interrupt' };

/** Messages the server sends to the client. */
export type ServerMessage =
  | { type: 'auth_ok'; defaultCwd: string }
  | { type: 'auth_error'; message: string }
  | { type: 'sessions'; list: SessionMeta[]; activeId: string | null }
  | { type: 'status'; state: ClaudeState; claudeSessionId?: string }
  | { type: 'user_echo'; text: string }
  | { type: 'assistant'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; id: string; content: unknown; isError: boolean }
  | { type: 'permission_request'; id: string; toolName: string; input: unknown }
  | { type: 'permission_resolved'; id: string; decision: PermissionDecision }
  | { type: 'result'; subtype: string; durationMs: number; isError: boolean; costUsd: number }
  | { type: 'error'; message: string };

/** A timestamped server message, used for reconnect history replay. */
export interface HistoryEntry {
  at: number;
  msg: ServerMessage;
}
