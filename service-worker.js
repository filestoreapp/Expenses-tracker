const CACHE = 'ledger-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e)=>{
  e.respondWith(
    caches.match(e.request).then(cached=>{
      return cached || fetch(e.request).then(resp=>{
        return caches.open(CACHE).then(c=>{
          c.put(e.request, resp.clone());
          return resp;
        });
      }).catch(()=>cached);
    })
  );
});
