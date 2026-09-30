/* Tee Forecast service worker.
   Two jobs: satisfy Chrome's installability requirement (it needs a fetch
   handler), and keep the app openable with no signal.

   Deliberately NOT cached: anything from open-meteo.com. A stale forecast is
   worse than no forecast, so weather requests always go to the network and
   fail honestly when there's no connection — the app already shows its own
   error state for that. */

const CACHE = 'tee-forecast-v1';
const SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(SHELL); })
      .then(function(){ return self.skipWaiting(); })
      .catch(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys()
      .then(function(keys){
        return Promise.all(keys.filter(function(k){ return k !== CACHE; })
                               .map(function(k){ return caches.delete(k); }));
      })
      .then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  const req = e.request;
  if(req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch(err){ return; }

  // Forecasts always come from the network, never the cache.
  if(url.hostname.indexOf('open-meteo.com') >= 0) return;

  // The page itself: network first so a new deploy lands immediately,
  // falling back to the cached copy when offline.
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req)
        .then(function(res){
          const copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put('./index.html', copy); });
          return res;
        })
        .catch(function(){
          return caches.match('./index.html').then(function(r){
            return r || caches.match('./');
          });
        })
    );
    return;
  }

  // Fonts and other static bits: cache first, they don't change.
  e.respondWith(
    caches.match(req).then(function(hit){
      if(hit) return hit;
      return fetch(req).then(function(res){
        const cacheable = res && res.status === 200 &&
          (url.origin === self.location.origin ||
           url.hostname.indexOf('fonts.googleapis.com') >= 0 ||
           url.hostname.indexOf('fonts.gstatic.com') >= 0);
        if(cacheable){
          const copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
