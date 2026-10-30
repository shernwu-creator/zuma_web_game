/* 祖瑪：叢林探險 — service worker
 *
 * Why it exists: Chrome/Edge only offer the "install app" prompt for a site
 * that ships a manifest AND a service worker with a fetch handler. Without it
 * the game could only ever be opened as a browser bookmark on a phone.
 *
 * Strategy
 *   - shell (index.html + manifest + icons) is pre-cached on install so the
 *     app opens offline;
 *   - navigations are network-first, so a new deploy is picked up immediately
 *     and the cached shell is only a fallback;
 *   - hashed build assets (js/css) are cache-first: their file name changes
 *     with every build, so a cached copy can never go stale;
 *   - media (mp4) and ranged requests are never intercepted: the victory clips
 *     must stay streamable/seekable.
 *
 * Bump CACHE_VERSION to drop every old cache on the next visit.
 */
const CACHE_VERSION = 'zuma-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Resolved against the scope, which is the folder index.html is deployed in
// (GitHub Pages serves this game from /zuma_web_game/, never from the root).
const CORE_ASSETS = [
  'index.html',
  'manifest.webmanifest',
  'favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);

      // Each file is added on its own: `addAll()` is all-or-nothing, so one
      // failing request would abort the whole install and kill installability.
      await Promise.all(
        CORE_ASSETS.map((asset) =>
          cache
            .add(new URL(asset, self.registration.scope).href)
            .catch(() => undefined),
        ),
      );

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key)),
      );

      await self.clients.claim();
    })(),
  );
});

const isCacheable = (request, url) => {
  if (request.method !== 'GET') {
    return false;
  }

  if (url.origin !== self.location.origin) {
    return false;
  }

  // Range requests must reach the server, otherwise the browser cannot seek
  // inside the victory clips.
  if (request.headers.has('range')) {
    return false;
  }

  if (/\.(mp4|webm)$/i.test(url.pathname)) {
    return false;
  }

  return true;
};

const cacheResponse = async (request, response) => {
  if (!response || response.status !== 200 || response.type === 'opaque') {
    return;
  }

  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(request, response.clone());
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!isCacheable(request, url)) {
    return;
  }

  // Navigations: fresh HTML first (so a deploy is visible on the next start),
  // cached shell second (so the installed app still opens offline).
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          await cacheResponse(request, response);
          return response;
        } catch {
          const cached = await caches.match(request);

          if (cached) {
            return cached;
          }

          const shell = await caches.match(
            new URL('index.html', self.registration.scope).href,
          );

          return shell || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);

      if (cached) {
        return cached;
      }

      try {
        const response = await fetch(request);
        await cacheResponse(request, response);
        return response;
      } catch {
        return cached || Response.error();
      }
    })(),
  );
});
