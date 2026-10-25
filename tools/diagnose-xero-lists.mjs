import fs from 'node:fs';
import crypto from 'node:crypto';
const fail=m=>{throw Error(m)};
const auth=JSON.parse(process.env.CLASP_CREDENTIALS||'{}');
const candidates=auth.tokens?Object.values(auth.tokens):[auth];
const c=candidates.find(t=>t&&t.refresh_token&&t.client_id&&t.client_secret);
if(!c)fail('Credential has no complete OAuth refresh-token entry; re-authorise clasp with the editing account.');
const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:c.client_id,client_secret:c.client_secret,refresh_token:c.refresh_token,grant_type:'refresh_token'})});
const token=await tokenResponse.json();
if(!tokenResponse.ok||!token.access_token)fail('Google token refresh failed: '+String(token.error||tokenResponse.status));
console.log('Google OAuth refresh: OK');
const id=process.env.SCRIPT_ID,dep=process.env.DEPLOYMENT_ID;
if(!id||!dep)fail('Missing script or deployment configuration.');
async function api(path,method='GET',body){
 const r=await fetch('https://script.googleapis.com/v1/projects/'+encodeURIComponent(id)+path,{method,cache:'no-store',headers:{'Cache-Control':'no-cache',Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const d=await r.json();
 if(!r.ok){const msg=String(d.error?.message||'Request rejected').replace(/[A-Za-z0-9_-]{30,}/g,'[redacted]');fail('Apps Script '+method+' failed ('+r.status+'): '+msg);}
 return d;
}
const clean=d=>d.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name));
const hash=f=>crypto.createHash('sha256').update(JSON.stringify(f)).digest('hex');


const d=await api('/deployments/'+encodeURIComponent(dep));
const supplied='https://script.google.com/macros/s/AKfycbxJx-ZAJdnkMhnQsf9XIUe91AX5PovdlZCjph6soiF5GDDGTXy8Q8AI0OHIY6lmZwaDAQ/exec';
const urls=(d.entryPoints||[]).map(p=>p.webApp?.url).filter(Boolean);
console.log('App connection matches configured deployment: '+urls.includes(supplied));
const files=clean(await api('/content?versionNumber='+d.deploymentConfig.versionNumber));
const source=files.filter(f=>f.type==='SERVER_JS').map(f=>f.source).join('\n');
console.log('Published inventory handler: '+source.includes('function xeroItems_('));
console.log('Published contact handler: '+source.includes('function xeroContacts_('));
console.log('Published PO handler: '+source.includes('function poCreate_('));
for(const action of ['xeroItems','xeroContacts','xeroStatus']){
 const r=await fetch(supplied+'?action='+action,{cache:'no-store'});
 let j;try{j=await r.json()}catch{j={}}
 console.log(action+' endpoint HTTP '+r.status+'; rejects unauthenticated access: '+(!j.ok&&/unknown user or password/i.test(j.error||'')));
}
