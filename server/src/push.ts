import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import webpush from 'web-push';

const STATE_DIR = join(homedir(), '.claude-bridge');
const SUBS_FILE = join(STATE_DIR, 'push-subscriptions.json');
const VAPID_FILE = join(STATE_DIR, 'vapid.json');

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

interface PushSub {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
  // Free-form label so the client can identify "this is my iPhone" vs "my MacBook".
  label?: string;
  createdAt: number;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Used by the SW to de-dupe and update an in-place notification. */
  tag?: string;
  /** Open this URL when the user taps the notification. */
  url?: string;
}

/**
 * Manages Web Push: VAPID key bootstrap, browser subscription persistence,
 * and a small `notify()` helper for the bridge to call when something
 * worth interrupting the user happens.
 *
 * All state lives in ~/.claude-bridge — no external service.
 */
class PushService {
  private keys: VapidKeys;
  private subs: PushSub[] = [];

  constructor() {
    mkdirSync(STATE_DIR, { recursive: true });
    this.keys = this.loadOrGenerateKeys();
    this.subs = this.loadSubs();
    webpush.setVapidDetails(
      'mailto:nobody@example.com',
      this.keys.publicKey,
      this.keys.privateKey,
    );
  }

  /** Public VAPID key — clients need it to subscribe. */
  get publicKey(): string {
    return this.keys.publicKey;
  }

  /** Number of currently-registered devices. */
  get subscriberCount(): number {
    return this.subs.length;
  }

  /** Add (or refresh) a browser subscription. Idempotent on endpoint. */
  subscribe(sub: Omit<PushSub, 'createdAt'>): void {
    this.subs = this.subs.filter((s) => s.endpoint !== sub.endpoint);
    this.subs.push({ ...sub, createdAt: Date.now() });
    this.persist();
  }

  unsubscribe(endpoint: string): void {
    this.subs = this.subs.filter((s) => s.endpoint !== endpoint);
    this.persist();
  }

  /** Fan-out a push payload to every registered device. Lossy & async. */
  async notify(payload: PushPayload): Promise<void> {
    if (this.subs.length === 0) return;
    const body = JSON.stringify(payload);
    const dead: string[] = [];

    await Promise.all(
      this.subs.map(async (sub) => {
        try {
          await webpush.sendNotification(sub, body);
        } catch (err: unknown) {
          const status = (err as { statusCode?: number })?.statusCode;
          // 404 / 410 = subscription expired or unsubscribed by the user
          // (e.g. they uninstalled the PWA). Garbage-collect it.
          if (status === 404 || status === 410) dead.push(sub.endpoint);
          else console.error('[push] send failed:', err);
        }
      }),
    );

    if (dead.length > 0) {
      this.subs = this.subs.filter((s) => !dead.includes(s.endpoint));
      this.persist();
    }
  }

  // ---- internals ---------------------------------------------------------

  private loadOrGenerateKeys(): VapidKeys {
    try {
      return JSON.parse(readFileSync(VAPID_FILE, 'utf8')) as VapidKeys;
    } catch {
      const keys = webpush.generateVAPIDKeys();
      writeFileSync(VAPID_FILE, JSON.stringify(keys), { mode: 0o600 });
      console.log('[push] generated new VAPID keys at', VAPID_FILE);
      return keys;
    }
  }

  private loadSubs(): PushSub[] {
    try {
      return JSON.parse(readFileSync(SUBS_FILE, 'utf8')) as PushSub[];
    } catch {
      return [];
    }
  }

  private persist(): void {
    try {
      writeFileSync(SUBS_FILE, JSON.stringify(this.subs, null, 2));
    } catch (err) {
      console.error('[push] persisting subs failed:', err);
    }
  }
}

export const push = new PushService();
