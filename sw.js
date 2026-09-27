// Boodschappen service worker
// - De app zelf (index.html): altijd eerst het netwerk, zodat je de nieuwste versie krijgt.
//   Geen antwoord binnen 3 seconden (slecht bereik in de winkel)? Dan de bewaarde versie.
// - Overige bestanden (iconen, lettertypen, bibliotheken): uit de cache, op de achtergrond ververst.
// - Ruimt alleen eigen caches op (voorvoegsel 'boodschappen-'), nooit die van Cucina of andere apps.
// Je hoeft dit bestand NIET aan te passen bij een nieuwe versie van index.html.

const PREFIX = 'boodschappen-';
const CACHE = PREFIX + 'v1';
const APP = new URL('index.html', self.registration.scope).href;
const VOORAF = ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];
const EXTERN = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(VOORAF)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const namen = await caches.keys();
    await Promise.all(namen.filter(n => n.startsWith(PREFIX) && n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

function metTijdslimiet(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(r => { clearTimeout(t); resolve(r); }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return;               // data nooit cachen

  const binnenApp = url.origin === self.location.origin && url.href.startsWith(self.registration.scope);
  const isPagina = req.mode === 'navigate' || (binnenApp && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')));

  if (isPagina && binnenApp) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const netwerk = fetch(APP, { cache: 'no-store' }).then(res => {
        if (res.ok) cache.put(APP, res.clone());
        return res;
      });
      try {
        return await metTijdslimiet(netwerk, 3000);
      } catch {
        const bewaard = await cache.match(APP);
        if (bewaard) return bewaard;
        return netwerk;                                            // nog niets bewaard: gewoon wachten
      }
    })());
    return;
  }

  if (binnenApp || EXTERN.includes(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const bewaard = await cache.match(req);
      const vers = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => bewaard);
      return bewaard || vers;
    })());
  }
});
