const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
function sessions(){
 const props=new Map([['TIMETREE_EMAIL','fixture@example.invalid'],['TIMETREE_PASSWORD','fixture-only']]),calls=[];
 const c={Date,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)})},LockService:{getUserLock:()=>({waitLock(){},releaseLock(){}})},Utilities:{getUuid:()=>crypto.randomUUID()},ttDigest_:s=>crypto.createHash('sha256').update(s).digest('hex'),ttCookie_:h=>h.cookie};
 c.ttFetch_=(path,cookie)=>{calls.push({path,cookie});return {headers:{cookie:'session=fixture'},json:{ok:true}};};
 vm.createContext(c);vm.runInContext(fs.readFileSync('apps-script/TimeTreeSession.gs','utf8'),c);return {c,props,calls};
}
test('calendar and photo reads share one server session across repeated requests',()=>{const h=sessions();h.c.ttSessionFetch_('/calendars');h.c.ttSessionFetch_('/activities');h.c.ttSessionFetch_('/calendars');assert.equal(h.calls.filter(x=>x.path.includes('/signin')).length,1);assert.ok(h.calls.filter(x=>!x.path.includes('/signin')).every(x=>x.cookie==='session=fixture'));});
test('failed sign-in backs off rather than repeating on every job-card open',()=>{const h=sessions();let attempts=0;h.c.ttFetch_=()=>{attempts++;throw Object.assign(Error('HTTP 400'),{httpStatus:400});};assert.throws(()=>h.c.ttSessionCookie_(),/paused/);assert.throws(()=>h.c.ttSessionCookie_(),/paused/);assert.equal(attempts,1);assert.ok(Number(h.props.get('TIMETREE_AUTH_RETRY_AFTER'))>Date.now());});
test('only a 401 renews the session, at most once; 400 and 403 do not cause a login storm',()=>{for(const status of [400,401,403]){const h=sessions();h.c.ttSessionCookie_();let reads=0,logins=0;h.c.ttFetch_=(path)=>{if(path.includes('/signin')){logins++;return {headers:{cookie:'new-session'}};}reads++;throw Object.assign(Error('failure'),{httpStatus:status});};assert.throws(()=>h.c.ttSessionFetch_('/activities'),/failure/);assert.equal(logins,status===401?1:0);assert.equal(reads,status===401?2:1);}});
function backend(){
 const pre=fs.readFileSync('tests/backend-release.test.cjs','utf8').split("test('actual me/login")[0],host={require,console};vm.createContext(host);vm.runInContext(pre,host);const b=host.backend();
 b.c.LockService.getUserLock=()=>({waitLock(){},releaseLock(){}});
 const ss=b.c.SpreadsheetApp.getActiveSpreadsheet(),insert=ss.insertSheet,reads=[];
 function support(sh){sh.getMaxColumns=()=>26;sh.insertColumnsAfter=()=>{};sh.getMaxRows=()=>100000;const get=sh.getRange;sh.getRange=function(r,c,n=1,m=1){const range=get.call(this,r,c,n,m),read=range.getValues;range.getValues=()=>{reads.push({sheet:sh.getName(),r,c,n,m});return read();};range.createTextFinder=(text)=>({matchEntireCell(){return this;},useRegularExpression(){return this;},findNext(){const i=sh.rows.findIndex((row,i)=>i>=r-1&&i<r+n-1&&String(row[c-1])===text);return i<0?null:{getRow:()=>i+1};}});return range;};return sh;}
 for(const sh of b.sheets.values())support(sh);ss.insertSheet=name=>support(insert(name));
 vm.runInContext(fs.readFileSync('apps-script/TimeTree.gs','utf8'),b.c);return {...b,reads};
}
function event(i,date,extra={}){const ms=Date.parse(date+'T08:00:00Z');return {id:'tt:63108444:event-'+i,source:'timetree',sourceCalendarId:'63108444',sourceEventId:'event-'+i,targets:['Flagship Solar','Hi Service'],jobType:'Flagship Electric',sourceUrl:'https://timetreeapp.com/calendars/test/events/event-'+i,date,endDate:date,startAt:ms,endAt:ms+3600000,sourceUpdatedAt:1,status:'SCHEDULED',recurrences:[],raw:{uuid:'event-'+i,calendar_id:63108444},...extra};}
test('date-indexed calendar reads retain recurrence and old data without rereading all raw JSON',()=>{
 const b=backend(),events=Array.from({length:1000},(_,i)=>event(i,'2020-01-01'));events.push(event(1000,'2026-11-03'),event(1001,'2020-01-01',{recurrences:['RRULE:FREQ=DAILY']}));
 b.c.timeTreeApply_(events,'fixture');const body={action:'calendar',from:'2026-11-01',to:'2026-11-30'};
 const first=b.get(body);assert.equal(first.ok,true,first.error);assert.equal(first.events.length,2);assert.ok(first.events.every(e=>!e.raw));b.reads.length=0;
 assert.equal(b.get(body).events.length,2);assert.equal(b.reads.filter(r=>r.sheet==='TimeTreeEvents').length,0);
 assert.equal(b.reads.filter(r=>r.sheet==='TimeTreeCalendarIndex'&&r.c===5).reduce((n,r)=>n+r.n,0),2);
 assert.equal(b.sheets.get('TimeTreeEvents').rows.length,1003);assert.equal(b.get({action:'calendar',from:'2020-01-01',to:'2020-01-31'}).events.length,1001);
 b.c.timeTreeApply_([event(1002,'2026-11-04')],'new');assert.equal(b.get(body).events.length,3);
});
test('date index applies company and worker permission filters on every request',()=>{const b=backend();b.c.timeTreeApply_([event(1,'2026-11-03')],'fixture');assert.equal(b.get({action:'hiCalendar',from:'2026-11-01',to:'2026-11-30'}).events.length,0);assert.equal(b.get({action:'calendar',from:'2026-11-01',to:'2026-11-30'},'worker').events.length,0);assert.equal(b.get({action:'calendar',from:'bad',to:'2026-11-30'}).ok,false);});
test('single job card lookup reads one card and retains assignment restrictions',()=>{const b=backend(),sh=b.sheets.get('JobCards');for(let i=0;i<100;i++)sh.appendRow(['card-'+i,'JC-'+i,'Client','Site','2026-11-03','Other Worker','','DRAFT','admin','','',JSON.stringify({company:'Flagship Solar'})]);b.reads.length=0;assert.equal(b.get({action:'jobCards',id:'card-50'}).jobCards.length,1);assert.equal(b.reads.filter(r=>r.sheet==='JobCards'&&r.m===12).reduce((sum,r)=>sum+r.n,0),1);assert.equal(b.get({action:'jobCards',id:'card-50'},'worker').jobCards.length,0);});
