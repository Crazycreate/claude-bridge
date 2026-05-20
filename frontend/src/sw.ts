/// <reference lib="webworker" />
//
// Custom service worker for Claude Bridge.
//   - Precache the built assets (workbox)
//   - Auto-update on new deploys
//   - Listen for `push` events from the bridge and surface system notifications
//   - Open / focus the right window when the user taps a notification

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting();
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

/** Shape of payloads the bridge sends via web-push. */
interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = { title: 'Claude Bridge', body: '有新的活动' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: payload.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data?.url as string | undefined) ?? '/';

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Prefer focusing an already-open window; otherwise open a fresh one.
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
