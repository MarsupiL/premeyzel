const CACHE = 'premeyzel-static-v1';
const FILES = ['./','./index.html','./confidentialite.html','./conditions.html','./informations.css','./start.js','./resident-app.js','./resident.css','./icons.js','./api-client.js','./auth.js','./app.js','./model.js','./photos.js','./gpx.js','./trail-location.js','./trail-map.js','./trail-api.js','./trails-ui.js','./vendor/leaflet/leaflet.js','./vendor/leaflet/leaflet.css','./assets/trails/les-chataignes.json','./assets/trails/les-chataignes.gpx','./art.js','./style.css','./assets/fonts.css','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-maskable.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(url=>new Request(url,{cache:'reload'})))));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('premeyzel-static-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  if(new URL(event.request.url).pathname.endsWith('/start.js'))event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
  else if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(async()=>await caches.match(event.request,{ignoreSearch:true})||await caches.match(new URL('./index.html',self.registration.scope))));
  else event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
