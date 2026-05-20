import { useEffect, useState } from 'react';
import { loadToken } from '../lib/storage';

export interface GitStatus {
  isRepo: boolean;
  branch?: string;
  dirty?: number;
  ahead?: number;
  behind?: number;
}

/**
 * Poll the bridge for `cwd`'s git state. Re-fetches whenever `refreshKey`
 * changes (we bump it after every Claude turn) and on cwd switches. Callers
 * get `null` until the first response arrives.
 */
export function useGitStatus(cwd: string | null, refreshKey: number): GitStatus | null {
  const [status, setStatus] = useState<GitStatus | null>(null);

  useEffect(() => {
    if (!cwd) {
      setStatus(null);
      return;
    }
    const token = loadToken();
    if (!token) return;
    let cancelled = false;
    fetch(`/api/git?cwd=${encodeURIComponent(cwd)}`, { headers: { 'x-auth-token': token } })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.error) {
          setStatus({ isRepo: false });
        } else {
          setStatus(body as GitStatus);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus({ isRepo: false });
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, refreshKey]);

  return status;
}
