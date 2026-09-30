/* Tee Forecast service worker.

   Mirrors what vite-plugin-pwa/Workbox generates for Golf Dash, which mints a
   WebAPK successfully on the same phone and origin:

     registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")))

   That is a CACHE-FIRST navigation route. The page is precached at install and
   served from cache on every load, so the start URL answers 200 whether or not
   there is a network. Android Chrome needs that guarantee before it will mint
   a WebAPK instead of a plain shortcut.

   Difference from Workbox: it revisions the precache at build time, which we
   have no build step for. Instead the cached page is refreshed in the
   background on each load, so a new deploy appears on the next launch.

   Only navigations are intercepted. Icons, fonts and the Open-Meteo calls go
   straight to the network — this worker can never hand back an image for a
   page request. */

const CACHE = 'tee-forecast-v4';
const PAGE  = 'index.html';

function precache(){
  return caches.open(CACHE).then(function(c){
    return fetch(PAGE, { cache:'reload' })
      .then(function(r){ return (r && r.ok) ? c.put(PAGE, r) : null; })
      .catch(function(){ return null; });
  });
}

self.addEventListener('install', function(e){
  e.waitUntil(precache().then(function(){ return self.skipWaiting(); })
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

function offline(){
  return new Response(
    '<!DOCTYPE html><meta charset="utf-8"><title>Tee Forecast</title>' +
    '<body style="background:#0E1D18;color:#E9F0EA;font-family:system-ui;' +
    'display:grid;place-items:center;height:100vh;margin:0">' +
    '<p>Offline &mdash; reopen when you have signal.</p>',
    { status:200, headers:{ 'Content-Type':'text/html; charset=utf-8' } }
  );
}

self.addEventListener('fetch', function(e){
  if(e.request.mode !== 'navigate') return;

  e.respondWith(
    caches.match(PAGE).then(function(hit){
      // Refresh the copy for next time, whether or not we served from cache.
      const fresh = fetch(PAGE, { cache:'reload' })
        .then(function(r){
          if(r && r.ok){
            const copy = r.clone();
            return caches.open(CACHE).then(function(c){ return c.put(PAGE, copy); })
                                     .then(function(){ return r; });
          }
          return r;
        })
        .catch(function(){ return null; });

      if(hit){
        e.waitUntil(fresh);
        return hit;
      }
      return fresh.then(function(r){ return r || offline(); });
    }).catch(function(){ return offline(); })
  );
});
