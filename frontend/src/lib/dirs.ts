import { loadToken } from './storage';

export interface DirListing {
  path: string;
  parent: string | null;
  entries: string[];
}

/** Fetch one directory's child folders from the bridge server. */
export async function listDirs(path: string): Promise<DirListing> {
  const token = loadToken();
  if (!token) throw new Error('未登录');
  const res = await fetch(`/api/dirs?path=${encodeURIComponent(path)}`, {
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
  const res = await fetch(`/api/cli-sessions?cwd=${encodeURIComponent(cwd)}`, {
    headers: { 'x-auth-token': token },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body.sessions as CliSessionMeta[];
}
