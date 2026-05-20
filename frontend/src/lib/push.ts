import { loadToken } from './storage';

/**
 * Web Push client helpers. Workflow:
 *   1. fetchPublicKey() — get the bridge's VAPID public key
 *   2. subscribeBrowser() — prompt for permission and register a PushSubscription
 *   3. POST the subscription to /api/push/subscribe so the bridge can fan out
 */

/** Convert the base64url VAPID key into the Uint8Array PushManager expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = loadToken();
  if (!token) throw new Error('未登录');
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      'x-auth-token': token,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
  });
}

export async function fetchPublicKey(): Promise<string> {
  const r = await authedFetch('/api/push/key');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).publicKey as string;
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

/** Returns the current Notification permission state. */
export function notificationPermission(): NotificationPermission {
  return typeof Notification !== 'undefined' ? Notification.permission : 'denied';
}

/** Get the existing subscription for this browser, if any. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Subscribe this browser; idempotent. Returns the subscription. */
export async function subscribeBrowser(): Promise<PushSubscription> {
  if (!pushSupported()) throw new Error('此浏览器不支持推送');

  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') throw new Error('未授权通知');
  } else if (Notification.permission !== 'granted') {
    throw new Error('通知已被禁用 — 在系统设置中放行后再试');
  }

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  const publicKey = await fetchPublicKey();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    // Browser API accepts a BufferSource — Uint8Array satisfies that at
    // runtime; the cast just bridges a recent lib.dom.d.ts tightening.
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });

  const r = await authedFetch('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: sub.toJSON().keys,
      expirationTime: sub.expirationTime,
      label: navigator.userAgent.slice(0, 80),
    }),
  });
  if (!r.ok) throw new Error(`subscribe failed: HTTP ${r.status}`);
  return sub;
}

export async function unsubscribeBrowser(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await authedFetch('/api/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}

export async function sendTestPush(): Promise<void> {
  const r = await authedFetch('/api/push/test', { method: 'POST' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}
