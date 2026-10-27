// Service worker : l'app s'ouvre même sans réseau.
// - Page principale : réseau d'abord, sinon copie en cache.
// - Fichiers de l'app (_next/static, icônes, polices) : cache d'abord.
// - Supabase et /api : jamais mis en cache (données gérées par IndexedDB).

const VERSION = 'min-obs-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/apple-touch-icon.png', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || caches.match(req))),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/icons/') || /\.(css|js|woff2?|png|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  // La page envoie la liste des fichiers déjà chargés avant l'activation du service worker.
  if (event.data && event.data.type === 'cache-urls') {
    const urls = (event.data.urls || []).filter((u) => {
      try {
        const x = new URL(u);
        return x.origin === self.location.origin && (x.pathname.startsWith('/_next/') || x.pathname.startsWith('/icons/'));
      } catch {
        return false;
      }
    });
    event.waitUntil(
      caches.open(VERSION).then((c) =>
        Promise.all(urls.map((u) => c.match(u).then((hit) => hit || fetch(u).then((r) => r.ok && c.put(u, r)).catch(() => {})))),
      ),
    );
  }
});
