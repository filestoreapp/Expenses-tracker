const CACHE = 'ledger-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
];
// Never cache this file — it must always be read fresh so config edits
// (like adding Firebase keys) take effect immediately without needing
// to bump the cache version.
const NEVER_CACHE = ['firebase-config.js'];

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
  const url = e.request.url;
  if(NEVER_CACHE.some(f => url.includes(f))){
    e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
    return;
  }
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
