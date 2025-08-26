/*
 * Service worker to provide offline support and caching for DashTrack.
 * The worker pre‑caches the core assets (HTML, CSS, JS, icons) during install,
 * cleans up old caches on activate, and serves cached responses on fetch events.
 */

const CACHE_NAME = 'dashtrack-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/logo-192.png',
  '/icons/logo-512.png'
];

self.addEventListener('install', event => {
  // Pre‑cache application shell files
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', event => {
  // Remove outdated caches
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      return (
        cachedResponse ||
        fetch(event.request).catch(() => caches.match('/index.html'))
      );
    })
  );
});