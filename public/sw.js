const CACHE_NAME = 'akwaba-v4';
const PRECACHE_URLS = [
  '/',
  '/css/app.css',
  '/js/app.js',
  '/js/api.js',
  '/js/audio.js',
  '/js/icons.js',
  '/manifest.json',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (
    event.request.method !== 'GET' ||
    url.includes('/api/') ||
    url.includes('/uploads/') ||
    url.includes('/admin')
  ) {
    return;
  }
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
