/* Atomic app shell. Versioned assets keep open pages consistent during updates. */
const CACHE = 'flagship-ops-v167-tech-groups';
const SHELL = [
  "./quote-job-calendar.js?release=20261104-step1-query",
  "./",
  "./index.html",
  "./ops-theme.css?release=20261104-bottom-nav",
  "./ops-theme.js?release=20261029",
  "./ops-dashboard.js?release=flagship-ops-v151-attendance",
  "./ops-updates-v135.js?release=flagship-ops-v167-tech-groups",
  "./release-notes.json",
  "./calendar-ui.6f647da4d4a8.css?release=flagship-ops-v151-attendance",
  "./vendor/rrule.min.js?release=flagship-ops-v151-attendance",
  "./timetree-calendar.071000ecf91b.js?release=flagship-ops-v151-attendance",
  "./stock-count.js?release=flagship-ops-v151-attendance",
  "./user-privileges.js?release=flagship-ops-v151-attendance",
  "./supabase-client.js?release=flagship-ops-v151-attendance",
  "./timesheet-sync.js?release=flagship-ops-v151-attendance",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./assets/band-top.jpg",
  "./assets/band-bottom.jpg",
  "./assets/cover.jpg",
  "./xero-customer.js?release=flagship-ops-v151-attendance",
  "./purchase-orders.js?release=flagship-ops-v151-attendance",
  "./po-inventory.js?release=flagship-ops-v151-attendance"
];
SHELL.push("./attendance-review.js?release=flagship-ops-v151-attendance");
const REQUIRED = SHELL.filter(p=>/\.(?:js|css)(?:\?|$)/.test(p)||p==='./index.html'||p==='./');
const MANUAL_GRANT_CACHE='manual-update-approval-flagship';
async function requireManualUpdateApproval(){
 const gate=await caches.open(MANUAL_GRANT_CACHE),url=new URL('./__manual_update_grant__',self.registration.scope).href,grant=await gate.match(url);
 if(!grant)throw Error('Manual update approval required.');
 await gate.delete(url);
 const at=Number(await grant.text());
 if(!at||Date.now()-at>120000)throw Error('Manual update approval expired. Tap Update again.');
}
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  await requireManualUpdateApproval();
  const cache=await caches.open(CACHE);
  try{
   await Promise.all(SHELL.map(async path=>{
    try{
     const response=await fetch(path,{cache:'no-store'});
     if(!response.ok)throw Error('HTTP '+response.status);
     await cache.put(path,response);
    }catch(error){if(REQUIRED.includes(path))throw error;}
   }));
   for(const path of REQUIRED)if(!await cache.match(path))throw Error('Incomplete app release.');
   await self.skipWaiting();
  }catch(error){await caches.delete(CACHE);throw error;}
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  await self.clients.claim();
  // Retain the previous release so open tabs can finish using their own assets.
  const keys=(await caches.keys()).filter(k=>/^flagship[-_]/i.test(k));
  const previous=keys.filter(k=>k!==CACHE).sort((a,b)=>Number((b.match(/v(\d+)/)||[])[1]||0)-Number((a.match(/v(\d+)/)||[])[1]||0));
  await Promise.all(previous.slice(1).map(k=>caches.delete(k)));
 })());
});
self.addEventListener('message',event=>{
 if(event.data&&event.data.type==='GET_VERSION'&&event.ports&&event.ports[0])event.ports[0].postMessage({version:CACHE});
});

self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
  for(const client of clients){if(new URL(client.url).origin===self.location.origin){await client.focus();return;}}
  return self.clients.openWindow(self.registration.scope);
 }));
});

self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 const exact=SHELL.some(p=>new URL(p,self.registration.scope).href===url.href);
 if(event.request.mode==='navigate'&&!url.search){
  event.respondWith((async()=>{const cache=await caches.open(CACHE),saved=await cache.match('./index.html');if(saved)return saved;const response=await fetch(event.request,{cache:'no-store'});if(!response.ok)throw Error('Navigation failed.');return response;})());
  return;
 }
 if(!exact)return; // API/auth/query requests and other apps never enter this shell cache.
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),hit=await cache.match(event.request);
  if(hit)return hit;
  return fetch(event.request,{cache:'no-store'});
 })());
});


