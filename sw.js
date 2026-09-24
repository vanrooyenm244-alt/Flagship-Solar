/* Flagship — offline shell.
   Bump CACHE when you change any file, otherwise phones keep the old copy. */
const CACHE = 'flagship-repairs-v86';
const SHELL = [
  './',
  './index.html',
  './supabase-client.js',
  './timesheet-sync.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './assets/band-top.jpg',
  './assets/band-bottom.jpg',
  './assets/cover.jpg',
  './xero-customer.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(SHELL.map((url) =>
        fetch(url, { cache: 'reload' }).then((res) => {
          if (!res || !res.ok) throw new Error('shell fetch failed: ' + url);
          return c.put(url, res);
        })
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && /^flagship[-_]/i.test(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API responses, auth queries or an unrelated page on this origin.
  if (url.search || !SHELL.some(p => new URL(p, self.registration.scope).pathname === url.pathname)) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (!res.ok) throw new Error('Navigation failed');
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() =>
        caches.match(e.request).then((hit) => hit || caches.match('./index.html'))
      )
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
    })
  );
});
