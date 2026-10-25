(function(){'use strict';
var home=document.getElementById('screenSettings');if(!home)return;
var menu=document.createElement('button');menu.type='button';menu.className='btn ghost';menu.style.cssText='width:100%;margin:12px 0;text-align:left';menu.textContent='App Updates · Version history & Test Checklist  ›';home.prepend(menu);
var panel=document.createElement('section');
panel.style.cssText='background:#142b40;color:#e9f3ff;border:1px solid #34536e;border-radius:12px;padding:14px;margin:14px 0';
panel.innerHTML='<div style="font-weight:700;margin-bottom:6px">App Updates</div><div id="opsVersionLabel" style="font-size:12px;color:#bad0e4;margin-bottom:10px">Checking installed version…</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="opsCheckVersion" class="btn ghost">Check for updates</button><button type="button" id="opsApplyVersion" class="btn" hidden>Apply update / Reload</button><button type="button" id="opsRollbackVersion" class="btn ghost" disabled title="Requires a validated previous release">Rollback</button></div><div id="opsVersionStatus" role="status" aria-live="polite" style="font-size:12px;margin-top:9px;color:#cbdceb">Rollback requires verified release snapshots. Save unfinished work before reloading.</div>';
panel.insertAdjacentHTML('beforeend','<div style="border-top:1px solid #34536e;margin-top:13px;padding-top:12px"><div style="font-weight:700;margin-bottom:6px">Wat het verander?</div><div id="opsReleaseChanges" style="font-size:12px;line-height:1.6">Laai weergawe-notas…</div><div style="font-weight:700;margin:14px 0 6px">Wat moet ek toets?</div><div id="opsReleaseTests" style="font-size:12px;line-height:1.6">Laai toetslys…</div><button class="btn ghost" id="opsClearTestChecks" type="button" style="margin-top:10px">Reset toetslys</button></div>');
panel.style.display='none';menu.insertAdjacentElement('afterend',panel);
menu.addEventListener('click',function(){var open=panel.style.display!=='none';panel.style.display=open?'none':'block';menu.textContent=open?'App Updates · Version history & Test Checklist  ›':'App Updates · Version history & Test Checklist  ▾';if(!open)loadRelease_();});
var label=panel.querySelector('#opsVersionLabel'),status=panel.querySelector('#opsVersionStatus'),check=panel.querySelector('#opsCheckVersion');
var apply=panel.querySelector('#opsApplyVersion'),availableVersion='';
function pageVersion(){var meta=document.querySelector('meta[name="flagship-release"]');return meta?meta.content:'Unknown (reload required)';}
function workerVersion(worker){
 return new Promise(function(resolve,reject){
  if(!worker){resolve('None');return;}
  var channel=new MessageChannel(),timer=setTimeout(function(){channel.port1.close();reject(Error('The active app worker did not confirm its version.'));},2500);
  channel.port1.onmessage=function(e){clearTimeout(timer);channel.port1.close();resolve(e.data&&e.data.version||'Unknown');};
  worker.postMessage({type:'GET_VERSION'},[channel.port2]);
 });
}
async function labelVersion(){
 var active='Unknown';
 try{active=await workerVersion(navigator.serviceWorker&&navigator.serviceWorker.controller);}catch(e){}
 label.textContent='Open app: '+pageVersion()+'. Active worker: '+active+'.';
 return active;
}
function latest(){
 return fetch('./sw.js?release-check='+Date.now(),{cache:'no-store'}).then(function(res){if(!res.ok)throw Error('Could not fetch latest release: HTTP '+res.status);return res.text();}).then(function(body){var m=body.match(/const\s+CACHE\s*=\s*['"]([^'"]+)/);if(!m)throw Error('Remote release was not identified.');return m[1];});
}
async function readyVersion(reg,expected){
 var end=Date.now()+35000;
 while(Date.now()<end){
  try{if(await workerVersion(reg.active)===expected&&await workerVersion(navigator.serviceWorker.controller)===expected)return true;}catch(e){}
  await new Promise(function(resolve){setTimeout(resolve,300);});
 }
 throw Error('The new release was not confirmed active. Check your connection and try again.');
}
check.addEventListener('click',async function(){
 check.disabled=true;apply.hidden=true;availableVersion='';status.textContent='Checking and downloading updates…';
 try{
  if(!('serviceWorker' in navigator))throw Error('App updates are not supported in this browser.');
  var remote=await latest(),reg=await navigator.serviceWorker.getRegistration();
  if(!reg)reg=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
  await reg.update();
  await readyVersion(reg,remote);
  await labelVersion();
  if(pageVersion()===remote){status.textContent='This open app is running the latest release: '+remote+'.';}
  else{availableVersion=remote;apply.hidden=false;status.textContent='Update '+remote+' is downloaded and ready. Save unfinished work, then tap Apply update / Reload to open it.';}
 }catch(e){status.textContent='Update not applied: '+String(e.message||e);}
 finally{check.disabled=false;}
});
apply.addEventListener('click',async function(){
 apply.disabled=true;
 try{
  var reg=await navigator.serviceWorker.getRegistration();
  if(!availableVersion||await workerVersion(reg&&reg.active)!==availableVersion||await workerVersion(navigator.serviceWorker.controller)!==availableVersion)throw Error('The downloaded release is not active yet. Check for updates again.');
  status.textContent='Opening '+availableVersion+'…';
  location.reload();
 }catch(e){status.textContent=String(e.message||e);apply.disabled=false;}
});
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('controllerchange',function(){labelVersion();});
function renderRelease_(data){
 var changes=panel.querySelector('#opsReleaseChanges'),tests=panel.querySelector('#opsReleaseTests');
 if(!data||!Array.isArray(data.changes)||!Array.isArray(data.tests))throw Error('Invalid release notes');
 function makeList(items){var ul=document.createElement('ul');ul.style.cssText='margin:4px 0;padding-left:18px';items.forEach(function(item){var li=document.createElement('li');li.textContent=item;ul.appendChild(li)});return ul;}
 changes.replaceChildren();var meta=document.createElement('div');meta.textContent=(data.version||'')+' · '+(data.date||'');meta.style.color='#bad0e4';changes.appendChild(meta,makeList(data.changes));
 tests.replaceChildren();data.tests.forEach(function(item,i){var wrap=document.createElement('label');wrap.style.cssText='display:flex;align-items:flex-start;gap:8px;margin:7px 0;cursor:pointer';var cb=document.createElement('input');cb.type='checkbox';cb.style.marginTop='3px';var key='fs-release-test-'+data.version+'-'+i;try{cb.checked=localStorage.getItem(key)==='yes';}catch(e){}cb.addEventListener('change',function(){try{localStorage.setItem(key,cb.checked?'yes':'no');}catch(e){}});var span=document.createElement('span');span.textContent=item;wrap.append(cb,span);tests.appendChild(wrap)});
 panel.querySelector('#opsClearTestChecks').onclick=function(){tests.querySelectorAll('input[type=checkbox]').forEach(function(c){c.checked=false;c.dispatchEvent(new Event('change'))});};
}
function loadRelease_(){
 fetch('./release-notes.json?v='+Date.now(),{cache:'no-store'}).then(function(res){if(!res.ok)throw Error('HTTP '+res.status);return res.json()}).then(renderRelease_).catch(function(e){panel.querySelector('#opsReleaseChanges').textContent='Weergawe-notas nie beskikbaar nie: '+e.message;panel.querySelector('#opsReleaseTests').textContent='Toetslys nie beskikbaar nie.';});
}
labelVersion();loadRelease_();
})();