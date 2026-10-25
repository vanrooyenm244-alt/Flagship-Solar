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
 const r=await fetch('https://script.googleapis.com/v1/projects/'+encodeURIComponent(id)+path,{method,headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const d=await r.json();
 if(!r.ok){const msg=String(d.error?.message||'Request rejected').replace(/[A-Za-z0-9_-]{30,}/g,'[redacted]');fail('Apps Script '+method+' failed ('+r.status+'): '+msg);}
 return d;
}
const clean=d=>d.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name));
const hash=f=>crypto.createHash('sha256').update(JSON.stringify(f)).digest('hex');
const deployment=await api('/deployments/'+encodeURIComponent(dep));
const prior=deployment.deploymentConfig;
if(!prior?.versionNumber||prior.scriptId!==id)fail('Deployment identity or version could not be verified.');
const head=clean(await api('/content'));
const published=clean(await api('/content?versionNumber='+prior.versionNumber));
if(hash(head)!==hash(published))fail('Remote HEAD differs from the published version. Stopped to avoid publishing unrelated changes.');
const repo=fs.readFileSync('apps-script/Code.gs','utf8');
const extract=s=>{const a=s.indexOf('function xeroHtmlRedirect_('),b=s.indexOf('function escXeroHtml_(',a);if(a<0||b<a||s.indexOf('function xeroHtmlRedirect_(',a+1)>=0)fail('Unexpected callback helper layout.');return {a,b,text:s.slice(a,b)};};
const fixed=extract(repo).text;
const next=head.map(f=>({...f}));
const code=next.find(f=>f.name==='Code'&&f.type==='SERVER_JS');
if(!code)fail('Remote Code file is missing.');
const old=extract(code.source);
if(old.text===fixed){console.log('Return button already published.');process.exit(0);}
if(!old.text.includes('window.top.location.replace'))fail('Live callback differs from the expected legacy implementation.');
code.source=code.source.slice(0,old.a)+fixed+code.source.slice(old.b);
if(hash(clean(await api('/content')))!==hash(head))fail('Live source changed during checks; no write made.');
const current=await api('/deployments/'+encodeURIComponent(dep));
if(current.deploymentConfig.versionNumber!==prior.versionNumber)fail('Deployment changed during checks; no write made.');
let pushed=false,version;
try{
 await api('/content','PUT',{files:next});pushed=true;
 if(hash(clean(await api('/content')))!==hash(next))fail('Source readback mismatch.');
 console.log('Callback-only upload and readback: OK');
 version=(await api('/versions','POST',{description:'Xero return button via GitHub'})).versionNumber;
 await api('/deployments/'+encodeURIComponent(dep),'PUT',{deploymentConfig:{...prior,versionNumber:version,description:'Xero return button via GitHub'}});
 const checked=await api('/deployments/'+encodeURIComponent(dep));
 if(checked.deploymentConfig.versionNumber!==version)fail('Deployment readback mismatch.');
 if(hash(clean(await api('/content?versionNumber='+version)))!==hash(next))fail('Published source readback mismatch.');
 console.log('Existing web app deployment updated and published source verified: OK');
}catch(e){
 if(pushed){
  const deployed=await api('/deployments/'+encodeURIComponent(dep));
  if(version&&deployed.deploymentConfig.versionNumber===version)await api('/deployments/'+encodeURIComponent(dep),'PUT',{deploymentConfig:prior});
  if(hash(clean(await api('/content')))===hash(next)){await api('/content','PUT',{files:head});console.log('Previous source restored after failure.');}
 }
 throw e;
}
