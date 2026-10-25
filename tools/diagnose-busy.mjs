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


const r=await fetch('https://script.googleapis.com/v1/processes:listScriptProcesses?scriptId='+encodeURIComponent(id)+'&pageSize=20',{headers:{Authorization:'Bearer '+token.access_token},cache:'no-store'});
const p=await r.json();
console.log('Execution inspection HTTP '+r.status);
if(r.ok)console.log(JSON.stringify((p.processes||[]).map(x=>({functionName:x.functionName,status:x.processStatus,type:x.processType,startTime:x.startTime,duration:x.duration}))));
const d=await api('/deployments/'+encodeURIComponent(dep));
const url=d.entryPoints?.find(x=>x.webApp?.url)?.webApp.url;
if(url){const begin=Date.now();const probe=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'poCreate'}),cache:'no-store'});let body={};try{body=await probe.json()}catch{}console.log('Unauthenticated PO probe: HTTP '+probe.status+'; elapsed ms '+(Date.now()-begin)+'; busy '+/^busy, try again/.test(body.error||'')+'; auth rejected '+/unknown user or password/i.test(body.error||''));}
