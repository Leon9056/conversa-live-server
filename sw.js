const CACHE="freechat-1.6.6-mega-fix";
const CORE=["./","./index.html","./style.css","./manifest.json","./config.js?v=1.6.6r1","./app.js?v=1.6.6r1","./icon.svg","./icon-192.png","./icon-512.png"];
self.addEventListener("message",e=>{if(e.data?.type==="SKIP_WAITING")self.skipWaiting();});
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("freechat-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
 if(e.request.method!=="GET")return;
 const url=new URL(e.request.url);
 if(url.pathname.includes("/api/")||url.pathname.includes("socket.io"))return;
 e.respondWith(fetch(e.request).then(r=>{
   if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});}
   return r;
 }).catch(()=>caches.match(e.request).then(r=>r||caches.match("./index.html"))));
});
