const CACHE = 'alexander-os-v15-5-senyaav-ai';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=15.5.0',
  './styles-v15.css?v=15.5.0',
  './finance-v151.css?v=15.5.0',
  './features-v152.css?v=15.5.0',
  './motion-v155.css?v=15.5.0',
  './senyaav-ai-v155.css?v=15.5.0',
  './senyaav-ai-v155.js?v=15.5.0',
  './app.js?v=15.5.0',
  './runtime-v155.js?v=15.5.0',
  './manifest.webmanifest?v=15.5.0',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const request = event.request;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
    for (const client of list) if ('focus' in client) return client.focus();
    return clients.openWindow('./?build=15.5.0');
  }));
});
