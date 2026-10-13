const CACHE = 'premeyzel-static-v1';
const FILES = ['./','./index.html','./app.js','./model.js','./art.js','./style.css','./assets/fonts.css','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-maskable.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('premeyzel-static-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match(new URL('./index.html',self.registration.scope))));
  else event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
