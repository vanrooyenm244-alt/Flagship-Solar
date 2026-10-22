(function(){'use strict';
var home=document.getElementById('screenHome');if(!home)return;
var panel=document.createElement('section');
panel.style.cssText='background:#142b40;color:#e9f3ff;border:1px solid #34536e;border-radius:12px;padding:14px;margin:14px 0';
panel.innerHTML='<div style="font-weight:700;margin-bottom:6px">App Updates</div><div id="opsVersionLabel" style="font-size:12px;color:#bad0e4;margin-bottom:10px">Checking installed version…</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="opsCheckVersion" class="btn ghost">Check for updates</button><button type="button" id="opsRollbackVersion" class="btn ghost" disabled title="Requires a validated previous release">Rollback</button></div><div id="opsVersionStatus" role="status" aria-live="polite" style="font-size:12px;margin-top:9px;color:#cbdceb">Rollback requires verified release snapshots. Save unfinished work before reloading.</div>';
home.appendChild(panel);
var label=panel.querySelector('#opsVersionLabel'),status=panel.querySelector('#opsVersionStatus'),check=panel.querySelector('#opsCheckVersion');
function installed(){
  if(!('caches' in window))return Promise.resolve('Unknown (no Cache API)');
  return caches.keys().then(function(keys){return keys.filter(function(k){return /^flagship[-_]/i.test(k)}).join(', ')||'Not cached';});
}
function labelVersion(){return installed().then(function(v){label.textContent='Installed cached release: '+v;return v;}).catch(function(){label.textContent='Installed release: unknown';return 'unknown';});}
function latest(){
  return fetch('./sw.js?release-check='+Date.now(),{cache:'no-store'}).then(function(res){if(!res.ok)throw Error('Could not fetch latest service worker: HTTP '+res.status);return res.text();}).then(function(body){var m=body.match(/const\s+CACHE\s*=\s*['"]([^'"]+)/);if(!m)throw Error('Remote service worker did not declare a cache version');return m[1];});
}
check.addEventListener('click',async function(){
  check.disabled=true;status.textContent='Checking for updates…';
  try{
    if(!('serviceWorker' in navigator))throw Error('Service Worker is not supported.');
    var remote=await latest(),reg=await navigator.serviceWorker.getRegistration();
    if(!reg){status.textContent='Latest release: '+remote+'. No registered service worker. Reload online to install.';return;}
    await reg.update();
    // Registration update can install asynchronously; display version rather than claiming completion.
    await new Promise(function(resolve){setTimeout(resolve,1800);});
    var current=await labelVersion();
    if(current.indexOf(remote)>=0 && navigator.serviceWorker.controller){
      status.textContent='Latest release ('+remote+') is cached. If this screen still looks old, save work and close/reopen the app.';
    }else if(reg.installing||reg.waiting){
      status.textContent='New version '+remote+' detected. Save work, then close and reopen the app.';
    }else{
      status.textContent='Latest published release: '+remote+'. Local cache: '+current+'. Update not confirmed; check internet connection or service worker installation.';
    }
  }catch(e){status.textContent='Update check failed: '+(e.message||e);}
  finally{check.disabled=false;}
});
labelVersion();
})();