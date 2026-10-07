'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {TimeTreeClient}=require('./timetree-client.cjs'),{normalize}=require('./normalize.cjs');
const BUSINESS=['Scheduling Calender','Service and Repair'];
function saveNew(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2),{flag:'wx',mode:0o600});}
function buildEvents(snapshot,routes={}){const events=[];for(const c of snapshot.calendars){const byId=new Map();for(const p of c.pages)for(const raw of p.events){const old=byId.get(raw.uuid);if(!old||Number(raw.updated_at)>=Number(old.updated_at))byId.set(raw.uuid,raw);}for(const raw of byId.values())events.push(normalize(raw,c.metadata,routes[c.metadata.name]||['Flagship Solar','Hi Service']));}return events;}
async function publish(events,env=process.env,fetchImpl=fetch){
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(env.APPS_SCRIPT_URL||''))throw Error('Valid Apps Script /exec URL required');
  if(!env.TIMETREE_CONNECTOR_TOKEN)throw Error('Connector token missing');
  let imported=0;
  for(let i=0;i<events.length;i+=20){const batch=events.slice(i,i+20),requestId=createHash('sha256').update(JSON.stringify(batch)).digest('hex');const r=await fetchImpl(env.APPS_SCRIPT_URL,{method:'POST',signal:AbortSignal.timeout(120000),headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'timeTreeImport',connectorToken:env.TIMETREE_CONNECTOR_TOKEN,requestId,events:batch})});if(!r.ok)throw Error('Import HTTP '+r.status);const j=await r.json();if(!j.ok||!Array.isArray(j.acceptedIds)||j.acceptedIds.length!==batch.length||batch.some(e=>!j.acceptedIds.includes(e.id)))throw Error('Import not fully acknowledged; retained archive can be retried');imported+=batch.length;console.log('Acknowledged '+imported+'/'+events.length);}
  return imported;
}
async function main(){
  const runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8),data=path.resolve(process.env.TIMETREE_DATA_DIR||path.join(__dirname,'data'));
  let snapshot;
  if(process.argv.includes('--from-snapshot')){const p=process.argv[process.argv.indexOf('--from-snapshot')+1];snapshot=JSON.parse(fs.readFileSync(p,'utf8'));}
  else {
    const c=new TimeTreeClient({email:process.env.TIMETREE_EMAIL,password:process.env.TIMETREE_PASSWORD});await c.login();const calendars=await c.calendars();snapshot={capturedAt:new Date().toISOString(),calendars:[]};
    for(const name of BUSINESS){const m=calendars.find(x=>x.name===name);if(!m)throw Error('Business calendar unavailable: '+name);const pages=await c.events(m.id);snapshot.calendars.push({metadata:m,pages});saveNew(path.join(data,'archive',runId,String(m.id)+'.json'),{metadata:m,pages});console.log(name+': '+pages.reduce((n,p)=>n+p.events.length,0)+' source records archived');}
  }
  // Complete source archive precedes normalization and every remote mutation.
  saveNew(path.join(data,'archive',runId,'snapshot.json'),snapshot);
  const events=buildEvents(snapshot,JSON.parse(process.env.TIMETREE_ROUTES_JSON||'{}'));saveNew(path.join(data,'archive',runId,'normalized.json'),events);
  if(process.argv.includes('--publish'))await publish(events);
  else console.log('Read-only run: '+events.length+' records prepared; no app data changed.');
  saveNew(path.join(data,'archive',runId,'result.json'),{ok:true,published:process.argv.includes('--publish'),count:events.length,completedAt:new Date().toISOString()});
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={buildEvents,publish};
