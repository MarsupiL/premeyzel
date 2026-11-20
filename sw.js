const CACHE = 'premeyzel-static-v1';
const FILES = [
  './',
  './index.html',
  './confidentialite.html',
  './conditions.html',
  './informations.css',
  './start.js',
  './resident-app.js',
  './trips.js',
  './messages-ui.js',
  './search.js',
  './html.js',
  './push-ui.js',
  './notification-links.js',
  './resident.css',
  './icons.js',
  './api-client.js',
  './auth.js',
  './auth-ui.js',
  './photos.js',
  './gpx.js',
  './trail-location.js',
  './trail-map.js',
  './polygon-editor.js',
  './hunting-state.js',
  './hunting-ui.js',
  './trail-api.js',
  './trails-ui.js',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './assets/trails/les-chataignes.json',
  './assets/trails/les-chataignes.gpx',
  './art.js',
  './style.css',
  './assets/fonts.css',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/hero-art.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable.png',
];
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map((url) => new Request(url, { cache: 'reload' })))),
  );
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('premeyzel-static-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin)
    return;
  if (new URL(event.request.url).pathname.endsWith('/start.js'))
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
  else if (event.request.mode === 'navigate')
    event.respondWith(
      fetch(event.request).catch(
        async () =>
          (await caches.match(event.request, { ignoreSearch: true })) ||
          (await caches.match(new URL('./index.html', self.registration.scope))),
      ),
    );
  else
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

const conversationID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function pushState() {
  try {
    const cache = await caches.open('premeyzel-push-state-v1');
    return (
      (await (await cache.match(new URL('./push-state', self.registration.scope).href))?.json()) ||
      {}
    );
  } catch {
    // Declarative-capable browsers can still display the generic server fallback.
    return {};
  }
}
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let data;
      try {
        data = event.data?.json();
      } catch {
        return;
      }
      const test = data?.type === 'test';
      const villageEvent = data?.type === 'event' && conversationID.test(data.eventId || '');
      if (
        !test &&
        !villageEvent &&
        (data?.type !== 'message' || !conversationID.test(data.conversationId || ''))
      )
        return;
      const state = await pushState();
      // Only an active matching account gets conversation-specific click data.
      // Declarative fallbacks contain no private text or sender. Conversation
      // destinations still require authentication and server-side membership.
      if (!state.enabled || state.owner !== data.recipientId) return;
      await self.registration.showNotification(
        test
          ? 'Prémeyzel · Test de notification'
          : villageEvent
            ? 'Prémeyzel · Nouvel événement'
            : 'Prémeyzel · Nouveau message',
        {
          body: test
            ? 'Les notifications fonctionnent sur cet appareil. Aucun message n’a été ajouté.'
            : villageEvent
              ? String(data.eventTitle || 'Un nouveau rendez-vous au village.').slice(0, 100)
              : 'Vous avez reçu un message privé. Ouvrez Prémeyzel pour le lire.',
          icon: new URL('./assets/icon-192.png', self.registration.scope).href,
          tag: test
            ? 'premeyzel-notification-test'
            : villageEvent
              ? 'premeyzel-event-' + data.eventId
              : 'premeyzel-message-' +
                (conversationID.test(data.messageId || '') ? data.messageId : data.conversationId),
          data: {
            type: data.type,
            conversationId: data.conversationId,
            eventId: data.eventId,
            recipientId: data.recipientId,
          },
        },
      );
      if (
        !test &&
        !villageEvent &&
        Number.isSafeInteger(data.unreadCount) &&
        data.unreadCount >= 0
      ) {
        try {
          await self.navigator?.setAppBadge?.(data.unreadCount);
        } catch {}
      }
      if (test || villageEvent) return;
      const windows = await self.clients.matchAll({ type: 'window' });
      windows.forEach((client) => client.postMessage({ type: 'premeyzel-new-message' }));
    })(),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const state = await pushState(),
        data = event.notification.data || {},
        url = new URL('./', self.registration.scope);
      const sameAccount = state.enabled && state.owner === data.recipientId;
      url.hash =
        data.type === 'event'
          ? '#/evenements' +
            (conversationID.test(data.eventId || '') ? '?event=' + data.eventId : '')
          : sameAccount && data.type === 'test'
            ? '#/compte'
            : '#/messages' +
              (sameAccount && conversationID.test(data.conversationId || '')
                ? '?c=' + data.conversationId
                : '');
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const app = windows.find((client) => {
        const u = new URL(client.url);
        return u.origin === url.origin && u.pathname.startsWith(url.pathname);
      });
      if (app) {
        const navigated = await app.navigate(url.href);
        if (navigated) await navigated.focus();
        else await self.clients.openWindow(url.href);
      } else await self.clients.openWindow(url.href);
    })(),
  );
});
