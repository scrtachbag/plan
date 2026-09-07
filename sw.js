/* Service worker de « Mon plan ».
   Coquille en cache d'abord pour un démarrage instantané et hors ligne.
   repas.json toujours demandé au réseau d'abord, pour ne jamais servir
   un menu périmé après une mise à jour hebdomadaire. */
var VERSION = 'plan-v3';
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.map(function (k) { return k === VERSION ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // repas.json : réseau d'abord, cache en secours
  if (url.pathname.indexOf('repas.json') !== -1) {
    e.respondWith(
      fetch(e.request).then(function (r) {
        var copie = r.clone();
        caches.open(VERSION).then(function (c) { c.put(e.request, copie); });
        return r;
      }).catch(function () { return caches.match(e.request); })
    );
    return;
  }

  // index.html : réseau d'abord aussi, pour récupérer les mises à jour de l'appli
  if (e.request.mode === 'navigate' || url.pathname.indexOf('index.html') !== -1) {
    e.respondWith(
      fetch(e.request).then(function (r) {
        var copie = r.clone();
        caches.open(VERSION).then(function (c) { c.put(e.request, copie); });
        return r;
      }).catch(function () {
        return caches.match(e.request).then(function (m) { return m || caches.match('./index.html'); });
      })
    );
    return;
  }

  // le reste : cache d'abord
  e.respondWith(
    caches.match(e.request).then(function (m) { return m || fetch(e.request); })
  );
});
