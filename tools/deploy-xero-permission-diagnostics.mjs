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
const expected="function xeroRaw_(url,token,method,payload,tenant,idempotencyKey){\n  function request_(bearer){\n    var headers={Authorization:'Bearer '+bearer,Accept:'application/json'};\n    if(tenant) headers['xero-tenant-id']=tenant;\n    if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;\n    var opt={method:(method||'get'),headers:headers,muteHttpExceptions:true};\n    if(payload!==null&&payload!==undefined){\n      opt.contentType='application/json';\n      opt.payload=JSON.stringify(payload);\n    }\n    return UrlFetchApp.fetch(url,opt);\n  }\n\n  var r=request_(token), code=r.getResponseCode(), txt=r.getContentText()||'';\n\n  // Access tokens can be revoked before their stored expiry time.\n  // Refresh once and retry the exact request, avoiding infinite loops.\n  if(code===401){\n    var fresh=xeroRefreshAccess_();\n    r=request_(fresh);\n    code=r.getResponseCode();\n    txt=r.getContentText()||'';\n  }\n\n  var j={};\n  try{j=JSON.parse(txt||'{}')}catch(e){}\n  if(code<200||code>=300){\n    var details=[];\n    function collectValidation_(obj,path,depth){\n      if(!obj||depth>5||details.length>=12)return;\n      if(Array.isArray(obj)){obj.forEach(function(v,i){collectValidation_(v,path+'['+(i+1)+']',depth+1);});return;}\n      if(typeof obj!=='object')return;\n      if(obj.ValidationErrors&&Array.isArray(obj.ValidationErrors)){\n        obj.ValidationErrors.forEach(function(v){var m=String(v.Message||v.message||'');if(m)details.push(path+': '+m);});\n      }\n      ['Elements','Quotes','LineItems','Invoices'].forEach(function(k){\n        if(obj[k])collectValidation_(obj[k],path+'.'+k,depth+1);\n      });\n    }\n    collectValidation_(j,'Xero',0);\n    var message=String(j.Message||j.message||j.Title||'');\n    var cause=details.length?(message+': '+details.join(' | ')):String(j.Detail||j.detail||message||txt);\n    throw new Error('Xero API '+code+': '+cause.slice(0,1800));\n  }\n  return j;\n}\n";
const replacement="function xeroRaw_(url,token,method,payload,tenant,idempotencyKey){\n  function request_(bearer){\n    var headers={Authorization:'Bearer '+bearer,Accept:'application/json'};\n    if(tenant) headers['xero-tenant-id']=tenant;\n    if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;\n    var opt={method:(method||'get'),headers:headers,muteHttpExceptions:true};\n    if(payload!==null&&payload!==undefined){\n      opt.contentType='application/json';\n      opt.payload=JSON.stringify(payload);\n    }\n    return UrlFetchApp.fetch(url,opt);\n  }\n\n  var r=request_(token), code=r.getResponseCode(), txt=r.getContentText()||'';\n\n  // Access tokens can be revoked before their stored expiry time.\n  // Refresh once and retry the exact request, avoiding infinite loops.\n  if(code===401){\n    var fresh=xeroRefreshAccess_();\n    token=fresh;\n    r=request_(fresh);\n    code=r.getResponseCode();\n    txt=r.getContentText()||'';\n  }\n\n  if(code===401){\n    var challenge='', scopes=[];\n    var responseHeaders=r.getAllHeaders();\n    Object.keys(responseHeaders).forEach(function(k){if(k.toLowerCase()==='www-authenticate')challenge=String(responseHeaders[k]);});\n    try{\n      var segment=String(token||'').split('.')[1];\n      var claims=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(segment)).getDataAsString());\n      scopes=Array.isArray(claims.scope)?claims.scope:String(claims.scope||'').split(/\\s+/);\n      scopes=scopes.filter(function(s){return /^(accounting\\.[a-z.]+|openid|profile|email|offline_access)$/.test(s);});\n    }catch(ignore){}\n    var missing=/insuffici?ent_scope/i.test(challenge);\n    var required=/\\/Items(?:[?\\/]|$)/.test(url)?'accounting.invoices':'';\n    var granted=scopes.length?scopes.join(', '):'unavailable';\n    throw new Error('Xero API 401: '+(missing?'insufficient permission':'access rejected after token refresh')+\n      (required?'. Items requires '+required:'')+'. Granted scopes: '+granted+\n      '. '+(missing||required&&scopes.length&&scopes.indexOf(required)<0?'Reconnect Xero and approve the updated permissions.':'Check the Xero organisation connection and user access.'));\n  }\n  var j={};\n  try{j=JSON.parse(txt||'{}')}catch(e){}\n  if(code<200||code>=300){\n    var details=[];\n    function collectValidation_(obj,path,depth){\n      if(!obj||depth>5||details.length>=12)return;\n      if(Array.isArray(obj)){obj.forEach(function(v,i){collectValidation_(v,path+'['+(i+1)+']',depth+1);});return;}\n      if(typeof obj!=='object')return;\n      if(obj.ValidationErrors&&Array.isArray(obj.ValidationErrors)){\n        obj.ValidationErrors.forEach(function(v){var m=String(v.Message||v.message||'');if(m)details.push(path+': '+m);});\n      }\n      ['Elements','Quotes','LineItems','Invoices'].forEach(function(k){\n        if(obj[k])collectValidation_(obj[k],path+'.'+k,depth+1);\n      });\n    }\n    collectValidation_(j,'Xero',0);\n    var message=String(j.Message||j.message||j.Title||'');\n    var cause=details.length?(message+': '+details.join(' | ')):String(j.Detail||j.detail||message||txt);\n    throw new Error('Xero API '+code+': '+cause.slice(0,1800));\n  }\n  return j;\n}\n";
function patch(files){
 const next=files.map(f=>({...f})),code=next.find(f=>f.name==='Code'&&f.type==='SERVER_JS');
 if(!code)fail('Remote Code file missing.');
 const match=code.source.match(/function xeroRaw_\\([\\s\\S]*?(?=\\nfunction )/);
 if(!match||![expected,replacement].includes(match[0]))fail('Remote request handler differs; stopped.');
 code.source=code.source.replace(match[0],replacement);
 new vm.Script(code.source);return next;
}
const deployment=await api('/deployments/'+encodeURIComponent(dep)),prior=deployment.deploymentConfig;
if(!prior?.versionNumber||prior.scriptId!==id)fail('Deployment identity could not be verified.');
const head=clean(await api('/content')),published=clean(await api('/content?versionNumber='+prior.versionNumber));
const next=patch(head);
if(hash(head)!==hash(published)&&hash(next)!==hash(published))fail('Unrelated unpublished source exists; stopped.');
if(hash(next)===hash(published)){
 if(hash(head)!==hash(next)){await api('/content','PUT',{files:next});}
 console.log('permission diagnostics already published; source verified.');process.exit(0);
}
if(hash(clean(await api('/content')))!==hash(head))fail('Source changed during checks.');
if(Number((await api('/deployments/'+encodeURIComponent(dep))).deploymentConfig.versionNumber)!==Number(prior.versionNumber))fail('Deployment changed during checks.');
let pushed=false,version;
try{
 await api('/content','PUT',{files:next});pushed=true;
 if(hash(clean(await api('/content')))!==hash(next))fail('Source readback mismatch.');
 console.log('Scope-only source update verified.');
 version=Number((await api('/versions','POST',{description:'Diagnose Xero 401 without exposing credentials'})).versionNumber);
 const updated=await api('/deployments/'+encodeURIComponent(dep),'PUT',{deploymentConfig:{...prior,versionNumber:version,description:'Diagnose Xero 401 without exposing credentials'}});
 console.log('Deployment update response version: '+updated.deploymentConfig?.versionNumber);
 let checked;
 for(let i=0;i<10;i++){
  checked=await api('/deployments/'+encodeURIComponent(dep));
  if(Number(checked.deploymentConfig.versionNumber)===version)break;
  await new Promise(r=>setTimeout(r,2000));
 }
 if(Number(checked.deploymentConfig.versionNumber)!==version)fail('Deployment version readback mismatch.');
 if(hash(clean(await api('/content?versionNumber='+version)))!==hash(next))fail('Published source mismatch.');
 console.log('Existing web app published permission diagnostics and source verified: OK');

}catch(e){
 if(pushed){
  const live=await api('/deployments/'+encodeURIComponent(dep));
  if(version&&Number(live.deploymentConfig.versionNumber)===version)await api('/deployments/'+encodeURIComponent(dep),'PUT',{deploymentConfig:prior});
  if(hash(clean(await api('/content')))===hash(next))await api('/content','PUT',{files:head});
  console.log('Previous source restored after failed verification.');
 }
 throw e;
}
