/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { t } from './strings';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// App shell only. Supabase data and media are never cached here.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// The font comes in ~100 pieces by character range; keep each piece once it has been needed,
// rather than downloading all of them up front.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.endsWith('.woff2'),
  new CacheFirst({ cacheName: 'font-pieces', plugins: [new ExpirationPlugin({ maxEntries: 200 })] }),
);

self.addEventListener('install', () => void self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// The weekly reminder. The server only says "weekly"; the words live here.
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification(t.appName, {
      body: t.reminder.pushBody,
      icon: '/icons/icon-192.png',
      tag: 'weekly',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      return open ? open.focus() : self.clients.openWindow('/');
    }),
  );
});
