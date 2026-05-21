import { loadToken } from './storage';
import { apiUrl } from './server';

export interface DirListing {
  path: string;
  parent: string | null;
  entries: string[];
}

/** Fetch one directory's child folders from the bridge server. */
export async function listDirs(path: string): Promise<DirListing> {
  const token = loadToken();
  if (!token) throw new Error('未登录');
  const res = await fetch(apiUrl(`/api/dirs?path=${encodeURIComponent(path)}`), {
    headers: { 'x-auth-token': token },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as DirListing;
}

export interface CliSessionMeta {
  sessionId: string;
  title: string;
  lastActiveAt: number;
  messages: number;
}

/** Fetch Claude CLI (terminal) sessions previously recorded in `cwd`. */
export async function listCliSessions(cwd: string): Promise<CliSessionMeta[]> {
  const token = loadToken();
  if (!token) throw new Error('未登录');
  const res = await fetch(apiUrl(`/api/cli-sessions?cwd=${encodeURIComponent(cwd)}`), {
    headers: { 'x-auth-token': token },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body.sessions as CliSessionMeta[];
}

async function postJson(path: string, payload: object): Promise<void> {
  const token = loadToken();
  if (!token) throw new Error('未登录');
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'x-auth-token': token, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
}

/** Hide a terminal session from the picker — its transcript stays on disk. */
export function hideCliSession(sessionId: string): Promise<void> {
  return postJson('/api/cli-sessions/hide', { sessionId });
}

/** Permanently delete a terminal session's transcript. Irreversible. */
export function deleteCliSession(cwd: string, sessionId: string): Promise<void> {
  return postJson('/api/cli-sessions/delete', { cwd, sessionId });
}
