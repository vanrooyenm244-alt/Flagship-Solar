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


import vm from 'node:vm';
const repo=fs.readFileSync('apps-script/Code.gs','utf8');
const scopeLine=repo.match(/^var XERO_SCOPES_='[^']+';/m);
if(!scopeLine||scopeLine[0]!=="var XERO_SCOPES_='openid profile email accounting.contacts accounting.invoices offline_access';")fail('Unexpected granular consent scopes.');
function patch(files){
 const next=files.map(f=>({...f})),code=next.find(f=>f.name==='Code'&&f.type==='SERVER_JS');
 if(!code)fail('Remote Code file missing.');
 const matches=code.source.match(/^var XERO_SCOPES_='[^']+';/gm);
 if(!matches||matches.length!==1)fail('Unexpected live scope configuration.');
 const original=matches[0].match(/'([^']+)'/)[1].split(/\s+/);
 const required=scopeLine[0].match(/'([^']+)'/)[1].split(/\s+/);
 if(original.some(s=>!required.includes(s)&&!['accounting.transactions','accounting.settings.read'].includes(s)))fail('Live scope configuration has unrelated changes.');
 code.source=code.source.replace(matches[0],scopeLine[0]);
 new vm.Script(code.source);return next;
}
const deployment=await api('/deployments/'+encodeURIComponent(dep)),prior=deployment.deploymentConfig;
if(!prior?.versionNumber||prior.scriptId!==id)fail('Deployment identity could not be verified.');
const head=clean(await api('/content')),published=clean(await api('/content?versionNumber='+prior.versionNumber));
const next=patch(head);
if(hash(head)!==hash(published)&&hash(next)!==hash(published))fail('Unrelated unpublished source exists; stopped.');
if(hash(next)===hash(published)){
 if(hash(head)!==hash(next)){await api('/content','PUT',{files:next});}
 console.log('granular consent scopes already published; source verified.');process.exit(0);
}
if(hash(clean(await api('/content')))!==hash(head))fail('Source changed during checks.');
if(Number((await api('/deployments/'+encodeURIComponent(dep))).deploymentConfig.versionNumber)!==Number(prior.versionNumber))fail('Deployment changed during checks.');
let pushed=false,version;
try{
 await api('/content','PUT',{files:next});pushed=true;
 if(hash(clean(await api('/content')))!==hash(next))fail('Source readback mismatch.');
 console.log('Scope-only source update verified.');
 version=Number((await api('/versions','POST',{description:'Use granular invoice and contact consent'})).versionNumber);
 const updated=await api('/deployments/'+encodeURIComponent(dep),'PUT',{deploymentConfig:{...prior,versionNumber:version,description:'Use granular invoice and contact consent'}});
 console.log('Deployment update response version: '+updated.deploymentConfig?.versionNumber);
 let checked;
 for(let i=0;i<10;i++){
  checked=await api('/deployments/'+encodeURIComponent(dep));
  if(Number(checked.deploymentConfig.versionNumber)===version)break;
  await new Promise(r=>setTimeout(r,2000));
 }
 if(Number(checked.deploymentConfig.versionNumber)!==version)fail('Deployment version readback mismatch.');
 if(hash(clean(await api('/content?versionNumber='+version)))!==hash(next))fail('Published source mismatch.');
 console.log('Existing web app published granular consent scopes and source verified: OK');

}catch(e){
 if(pushed){
  const live=await api('/deployments/'+encodeURIComponent(dep));
  if(version&&Number(live.deploymentConfig.versionNumber)===version)await api('/deployments/'+encodeURIComponent(dep),'PUT',{deploymentConfig:prior});
  if(hash(clean(await api('/content')))===hash(next))await api('/content','PUT',{files:head});
  console.log('Previous source restored after failed verification.');
 }
 throw e;
}
