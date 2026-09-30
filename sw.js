/* Tee Forecast service worker.

   Android Chrome only mints a WebAPK (a real app in the drawer, no Chrome
   badge) if this worker can answer start_url with an HTTP 200 while offline.
   If it can't, Chrome silently falls back to a plain home-screen shortcut.
   So every path below ends in a 200 — never a throw, never a miss.

   Deliberately NOT cached: anything from open-meteo.com. A stale forecast is
   worse than none, so weather requests always go to the network and the app
   shows its own error state when they fail. */

const CACHE = 'tee-forecast-v2';
const PAGE  = './index.html';

// Cached one at a time: addAll() is atomic, so a single failure would leave
// the cache empty and block WebAPK minting.
function warm(){
  return caches.open(CACHE).then(function(c){
    return Promise.all(['./', PAGE, './manifest.webmanifest'].map(function(u){
      return fetch(u, { cache:'reload' })
        .then(function(r){ return r && r.ok ? c.put(u, r) : null; })
        .catch(function(){ return null; });
    }));
  });
}

self.addEventListener('install', function(e){
  e.waitUntil(warm().then(function(){ return self.skipWaiting(); })
                    .catch(function(){ return self.skipWaiting(); }));
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

// Last resort so the offline check always sees a 200, even if the cache is
// somehow empty. The real page replaces this the moment there's a network.
function stub(){
  return new Response(
    '<!DOCTYPE html><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Tee Forecast</title>' +
    '<body style="background:#0E1D18;color:#E9F0EA;font-family:system-ui;' +
    'display:grid;place-items:center;height:100vh;margin:0">' +
    '<p>Offline &mdash; reopen when you have signal.</p>',
    { status:200, headers:{ 'Content-Type':'text/html; charset=utf-8' } }
  );
}

function cachedPage(){
  return caches.match(PAGE)
    .then(function(r){ return r || caches.match('./'); })
    .then(function(r){ return r || stub(); })
    .catch(function(){ return stub(); });
}

self.addEventListener('fetch', function(e){
  const req = e.request;
  if(req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch(err){ return; }

  // Forecasts always come from the network, never the cache.
  if(url.hostname.indexOf('open-meteo.com') >= 0) return;

  // The page: network first so a new deploy lands right away, cache when
  // offline, and a 200 stub if even that is missing.
  if(req.mode === 'navigate' || (url.origin === self.location.origin &&
     (url.pathname.endsWith('/') || url.pathname.endsWith('index.html')))){
    e.respondWith(
      fetch(req)
        .then(function(res){
          if(res && res.ok){
            const copy = res.clone();
            caches.open(CACHE).then(function(c){ c.put(PAGE, copy); });
          }
          return res;
        })
        .catch(cachedPage)
    );
    return;
  }

  // Icons, manifest, fonts: cache first, they rarely change.
  e.respondWith(
    caches.match(req).then(function(hit){
      if(hit) return hit;
      return fetch(req).then(function(res){
        const keep = res && res.status === 200 &&
          (url.origin === self.location.origin ||
           url.hostname.indexOf('fonts.googleapis.com') >= 0 ||
           url.hostname.indexOf('fonts.gstatic.com') >= 0);
        if(keep){
          const copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){
        return req.mode === 'navigate' ? cachedPage() : Response.error();
      });
    })
  );
});
