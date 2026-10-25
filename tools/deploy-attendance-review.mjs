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
const rules=[{"name":"reservedWorkerTabs_","from":"    typeof STOCK_SHEET === 'string' ? STOCK_SHEET : 'Stock',","to":"    'Timesheet Audit','Timesheet Approvals','Flagship Clock Events','Hi Clock Events','PurchaseOrders',\n    typeof STOCK_SHEET === 'string' ? STOCK_SHEET : 'Stock',"},{"name":"rebuildWorkerTabs","from":"  if (n < 1) return 'No data yet.';\n\n  var data = src.getRange(2, 1, n, 14).getValues();\n  var byWorker = Object.create(null);\n  data.forEach(function (r) {\n    var w = String(r[3] || '').trim();\n    if (!w) return;\n    if (scoped && !requestedWorkers.some(function(x) { return String(x || '').trim() === w; })) return;\n    if (!byWorker[w]) byWorker[w] = [];\n    byWorker[w].push([r[0], r[1], r[2], r[4], timeTxt_(r[5]), timeTxt_(r[6]),\n                      r[7], r[8], r[9], r[10], r[11], r[12], r[13]]);\n  });\n\n  var count = 0;\n  Object.keys(byWorker).forEach(function (w) {\n    validateWorkerTab_(w, workerMasterRows_());\n    var sh = workerSheet_(w);\n    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, WORKER_COLS.length).clearContent();\n    sh.getRange(2, 5, byWorker[w].length, 2).setNumberFormat('@');\n    sh.getRange(2, 1, byWorker[w].length, WORKER_COLS.length).setValues(byWorker[w]);","to":"  if(n<1&&!scoped)return 'No data yet.';\n\n  var data = n>0?src.getRange(2, 1, n, 14).getValues():[];\n  var byWorker = Object.create(null);\n  data.forEach(function (r) {\n    var w = String(r[3] || '').trim();\n    if (!w) return;\n    if (scoped && !requestedWorkers.some(function(x) { return String(x || '').trim() === w; })) return;\n    if (!byWorker[w]) byWorker[w] = [];\n    byWorker[w].push([r[0], r[1], r[2], r[4], timeTxt_(r[5]), timeTxt_(r[6]),\n                      r[7], r[8], r[9], r[10], r[11], r[12], r[13]]);\n  });\n\n  if(scoped)requestedWorkers.forEach(function(w){if(!byWorker[w])byWorker[w]=[];});\n  var count = 0;\n  Object.keys(byWorker).forEach(function (w) {\n    validateWorkerTab_(w, workerMasterRows_());\n    var sh = workerSheet_(w);\n    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, WORKER_COLS.length).clearContent();\n    if(byWorker[w].length)sh.getRange(2, 5, byWorker[w].length, 2).setNumberFormat('@');\n    if(byWorker[w].length)sh.getRange(2, 1, byWorker[w].length, WORKER_COLS.length).setValues(byWorker[w]);"},{"name":"hiClockAction_","from":"    var lunch=new Date(day+'T00:00:00Z').getUTCDay()===6?0:60;","to":"    var lunch=new Date(day+'T00:00:00Z').getUTCDay()===6?0:(body.lunch==null?60:Number(body.lunch));"},{"name":"flagshipClockAction_","from":"    var lunch=new Date(day+'T00:00:00Z').getUTCDay()===6?0:60;","to":"    var lunch=new Date(day+'T00:00:00Z').getUTCDay()===6?0:(body.lunch==null?60:Number(body.lunch));"},{"name":"tsStage_","from":"      if(user.role==='Worker'&&worker.toLowerCase()!==canonicalWorkerForUser_(user).toLowerCase()){status='blocked';reason='Workers may only submit their own time.';}\n      else if(user.role!=='Admin'&&!isCurrentCycle_(ds)){status='closed';reason='Pay cycle closed.';}\n      else if(!calc_(ds,r.timeIn,r.timeOut,r.lunch)){status='skipped';reason=shiftReviewReason_(ds,r.timeIn,r.timeOut,r.lunch);}\n      if(status==='pending'){\n        var prev=existing.findIndex(function(v){return v[6]==='Pending'&&String(v[1]).toLowerCase()===worker.toLowerCase()&&dateStr_(v[2])===ds;});\n        var clean={worker:worker,date:ds,job:String(r.job||''),timeIn:String(r.timeIn||''),timeOut:String(r.timeOut||''),lunch:new Date(ds+'T00:00:00Z').getUTCDay()===6?0:Number(r.lunch),note:String(r.note||'')};\n        if(prev>=0){sh.getRange(prev+2,4).setValue(JSON.stringify(clean));sh.getRange(prev+2,5,1,2).setValues([[user.username,new Date()]]);}","to":"      if(user.role!=='Admin'&&worker.toLowerCase()!==canonicalWorkerForUser_(user).toLowerCase()){status='blocked';reason='Workers may only submit their own time.';}\n      else if(ds>hiClockToday_()){status='blocked';reason='Future shifts are not allowed.';}\n      else if(findEntry_(worker,ds)){status='blocked';reason='An approved entry exists. Admin must use Attendance review to correct it with a reason.';}\n      else if(user.role!=='Admin'&&!isCurrentCycle_(ds)){status='closed';reason='Pay cycle closed.';}\n      else if(!calc_(ds,r.timeIn,r.timeOut,r.lunch)){status='skipped';reason=shiftReviewReason_(ds,r.timeIn,r.timeOut,r.lunch);}\n      if(status==='pending'){\n        var prev=existing.findIndex(function(v){return v[6]==='Pending'&&String(v[1]).toLowerCase()===worker.toLowerCase()&&dateStr_(v[2])===ds;});\n        var clean={worker:worker,date:ds,job:String(r.job||''),timeIn:String(r.timeIn||''),timeOut:String(r.timeOut||''),lunch:new Date(ds+'T00:00:00Z').getUTCDay()===6?0:Number(r.lunch),note:String(r.note||'')};\n        if(prev>=0){tsAudit_(user,'resubmit',worker,ds,'Updated pending submission',existing[prev],clean);sh.getRange(prev+2,4).setValue(JSON.stringify(clean));sh.getRange(prev+2,5,1,2).setValues([[user.username,new Date()]]);}"},{"name":"tsReview_","from":"    sh.getRange(at+2,7,1,4).setValues([[action==='approve'?'Approved':'Rejected',user.username,new Date(),String(body.reason||'')]]);","to":"    tsAudit_(user,action,String(row[1]),dateStr_(row[2]),String(body.reason||''),row,{decision:action,reviewer:user.username});\n    sh.getRange(at+2,7,1,4).setValues([[action==='approve'?'Approved':'Rejected',user.username,new Date(),String(body.reason||'')]]);"},{"name":"poSheet_","from":"  if(sh.getLastRow()===0)sh.appendRow(['Client Key','PO ID','PO Number','Supplier','Job','Created By','Created At','Status']);","to":"  if(sh.getLastRow()===0)sh.appendRow(['Client Key','PO ID','PO Number','Supplier','Job','Created By','Created At','Status','Company']);"},{"name":"poCreate_","from":"  poSheet_().appendRow([key,p.PurchaseOrderID,p.PurchaseOrderNumber||'',String(po.supplier||''),String(po.job||''),u.username,new Date(),p.Status||'DRAFT']);","to":"  poSheet_().appendRow([key,p.PurchaseOrderID,p.PurchaseOrderNumber||'',String(po.supplier||''),String(po.job||''),u.username,new Date(),p.Status||'DRAFT',company]);"},{"name":"poRecent_","from":" var rows=sh.getRange(start,1,Math.min(n,20),8).getValues();","to":" var rows=sh.getRange(start,1,Math.min(n,20),9).getValues().filter(function(r){return String(r[8]||'Flagship Solar')===String(body.company||'Flagship Solar');});"},{"name":"doGet","from":"    if (p.action === 'timesheetPending') return out_({ok:true,entries:tsPendingList_(auth_(body,['Admin']))});","to":"    if (p.action === 'attendanceHistory') return out_(tsHistory_(Object.assign({},body,p)));\n    if (p.action === 'attendanceRecords') return out_(tsRecords_(Object.assign({},body,p)));\n    if (p.action === 'timesheetPending') return out_({ok:true,entries:tsPendingList_(auth_(body,['Admin']))});"},{"name":"doPost","from":"    if (body.action === 'timesheetDelete') {","to":"    if (body.action === 'attendanceManage') return out_(tsManage_(body));\n    if (body.action === 'timesheetDelete') {\n      return out_({ok:false,error:'Use Attendance review → Cancel incorrect entry and provide a reason. Original records must be retained.'});\n      /* Legacy deletion disabled. */"}];
const helper=fs.readFileSync('apps-script/TimesheetAudit.gs','utf8').trimEnd();
function patch(files){
 const next=files.map(f=>({...f})),code=next.find(f=>f.name==='Code'&&f.type==='SERVER_JS');
 if(!code)fail('Remote Code missing.');
 for(const rule of rules){
   const re=new RegExp('^function '+rule.name+'\\([^]*?(?=^function |$(?![^]))','gm');
   const candidates=next.filter(f=>f.type==='SERVER_JS'&&new RegExp('function '+rule.name+'\\(').test(f.source));
   if(candidates.length!==1){console.log('Available clock functions: '+next.filter(f=>f.type==='SERVER_JS').map(f=>f.name+': '+(f.source.match(/function (?:hiClock|flagshipClock)\\w+/g)||[]).join(', ')).join('; '));fail('Expected handler missing or duplicated: '+rule.name);}
   const target=candidates[0],match=target.source.match(re);
   if(!match||match.length!==1)fail('Expected handler format differs: '+rule.name);
   let source=match[0];
   if(source.includes(rule.to))continue;
   if(source.split(rule.from).length!==2)fail('Live handler differs at '+rule.name+'; stopped before write.');
   target.source=target.source.replace(source,source.replace(rule.from,rule.to));
   new vm.Script(target.source);
 }
 new vm.Script(code.source);
 const old=next.find(f=>f.name==='TimesheetAudit');
 if(old&&old.source.trimEnd()!==helper)fail('Unrelated TimesheetAudit file exists.');
 if(!old)next.push({name:'TimesheetAudit',type:'SERVER_JS',source:helper});
 new vm.Script(helper);
 return next.sort((a,b)=>a.name.localeCompare(b.name));
}
const deployment=await api('/deployments/'+encodeURIComponent(dep)),prior=deployment.deploymentConfig;
if(!prior?.versionNumber||prior.scriptId!==id)fail('Deployment identity could not be verified.');
const head=clean(await api('/content')),published=clean(await api('/content?versionNumber='+prior.versionNumber));
const next=patch(head);
if(hash(head)!==hash(published)&&hash(next)!==hash(published))fail('Unrelated unpublished source exists; stopped.');
if(hash(next)===hash(published)){
 if(hash(head)!==hash(next)){await api('/content','PUT',{files:next});}
 console.log('attendance review already published; source verified.');process.exit(0);
}
if(hash(clean(await api('/content')))!==hash(head))fail('Source changed during checks.');
if(Number((await api('/deployments/'+encodeURIComponent(dep))).deploymentConfig.versionNumber)!==Number(prior.versionNumber))fail('Deployment changed during checks.');
let pushed=false,version;
try{
 await api('/content','PUT',{files:next});pushed=true;
 if(hash(clean(await api('/content')))!==hash(next))fail('Source readback mismatch.');
 console.log('Attendance source and preserved remote files verified.');
 version=Number((await api('/versions','POST',{description:'Audited attendance review for both apps'})).versionNumber);
 const updated=await api('/deployments/'+encodeURIComponent(dep),'PUT',{deploymentConfig:{...prior,versionNumber:version,description:'Audited attendance review for both apps'}});
 console.log('Deployment update response version: '+updated.deploymentConfig?.versionNumber);
 let checked;
 for(let i=0;i<10;i++){
  checked=await api('/deployments/'+encodeURIComponent(dep));
  if(Number(checked.deploymentConfig.versionNumber)===version)break;
  await new Promise(r=>setTimeout(r,2000));
 }
 if(Number(checked.deploymentConfig.versionNumber)!==version)fail('Deployment version readback mismatch.');
 if(hash(clean(await api('/content?versionNumber='+version)))!==hash(next))fail('Published source mismatch.');
 console.log('Existing web app published attendance review and source verified: OK');

}catch(e){
 if(pushed){
  const live=await api('/deployments/'+encodeURIComponent(dep));
  if(version&&Number(live.deploymentConfig.versionNumber)===version)await api('/deployments/'+encodeURIComponent(dep),'PUT',{deploymentConfig:prior});
  if(hash(clean(await api('/content')))===hash(next))await api('/content','PUT',{files:head});
  console.log('Previous source restored after failed verification.');
 }
 throw e;
}
