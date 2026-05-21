/**
 * Bridge server location.
 *
 * The web build is served *by* the bridge itself, so it talks to the server
 * over same-origin relative URLs. The packaged Android app is not served by
 * anything — it must be told where the bridge lives. This module is the single
 * place that difference is resolved: `apiUrl()` / `wsUrl()` produce same-origin
 * URLs when no base is configured, and absolute URLs when one is.
 */

const BASE_KEY = 'bridge_server';

/**
 * Configured bridge origin, e.g. `http://192.168.1.5:8787`. An empty string
 * means "same origin" — the normal case for the bridge-hosted web page.
 */
export function loadServerBase(): string {
  try {
    return localStorage.getItem(BASE_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Persist the bridge origin. Trailing slashes are trimmed for clean joins. */
export function saveServerBase(base: string): void {
  try {
    localStorage.setItem(BASE_KEY, base.trim().replace(/\/+$/, ''));
  } catch {
    /* private-mode storage failure is non-fatal */
  }
}

/** Absolute URL for a bridge API path; same-origin when no base is configured. */
export function apiUrl(path: string): string {
  return loadServerBase() + path;
}

/** WebSocket URL for the bridge, from the configured base or the page origin. */
export function wsUrl(): string {
  const base = loadServerBase();
  if (base) return base.replace(/^http/, 'ws') + '/ws';
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}
