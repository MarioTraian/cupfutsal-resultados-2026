const CACHE = 'cupfutsal-2026-v5';

// Solo se cachean assets estáticos — NUNCA index.html ni sw.js
const PRECACHE = [
  '/css/styles.css',
  '/js/app.js',
  '/js/admin.js',
  '/js/firebase-config.js',
  '/manifest.json',
  '/assets/icons/icon.svg',
  '/assets/icons/icon-maskable.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // HTML → siempre red primero, caché solo como fallback sin conexión
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // CSS / JS / assets → caché primero (rápido), red si no está
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response.ok) return response;
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(request, clone));
        return response;
      });
    })
  );
});
