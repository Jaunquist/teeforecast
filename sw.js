/* Tee Forecast service worker — deliberately minimal.

   Android Chrome only mints a WebAPK (a real app in the drawer, no Chrome
   badge) if a service worker can answer the start URL with HTTP 200 while
   offline. That is the ONLY job here.

   It intercepts navigations and nothing else. Icons, fonts, the manifest and
   the Open-Meteo calls all go straight to the network untouched, so there is
   no way for this worker to hand back the wrong kind of response. */

const CACHE = 'tee-forecast-v3';
const PAGE  = 'index.html';

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.add(new Request(PAGE, { cache:'reload' })); })
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
  // Anything that isn't a page load is none of this worker's business.
  if(e.request.mode !== 'navigate') return;

  e.respondWith(
    fetch(e.request)
      .then(function(res){
        if(res && res.ok){
          const copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(PAGE, copy); });
        }
        return res;
      })
      .catch(function(){
        return caches.match(PAGE).then(function(r){
          return r || new Response(
            '<!DOCTYPE html><meta charset="utf-8"><title>Tee Forecast</title>' +
            '<body style="background:#0E1D18;color:#E9F0EA;font-family:system-ui;' +
            'display:grid;place-items:center;height:100vh;margin:0">' +
            '<p>Offline &mdash; reopen when you have signal.</p>',
            { status:200, headers:{ 'Content-Type':'text/html; charset=utf-8' } }
          );
        });
      })
  );
});
