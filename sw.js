/* Flagship — offline shell.
   Bump CACHE when you change any file, otherwise phones keep the old copy. */
const CACHE = 'flagship-v18';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './assets/band-top.jpg',
  './assets/band-bottom.jpg',
  './assets/cover.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      /* cache:'reload' bypasses the browser's own HTTP cache. Without it,
         addAll can re-cache a stale index.html that GitHub Pages served
         from its max-age window — the new worker then serves old code. */
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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Never cache calls to the Apps Script backend — they must always be live.
  if (e.request.url.indexOf('script.google.com') !== -1) return;

  /* The page itself: network first, cache as fallback. A new version then
     appears as soon as there is signal, without waiting for a CACHE bump.
     No signal on site — it falls straight back to the cached copy. */
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() =>
        caches.match(e.request).then((hit) => hit || caches.match('./index.html'))
      )
    );
    return;
  }

  /* Everything else: cache first, it does not change between versions. */
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
