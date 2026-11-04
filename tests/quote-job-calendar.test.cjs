const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function backend(){
 const headers=['Job No','Rep','QUOTE NO','Client Name','Address','Movement - What happens next? Quote? Awaiting Customer?','Description','Contact Number','Email Address','Company Name','Book in app','Quote Emailed','Job Accepted','Invoice Number'];
 const jobs=[headers,['300','Michael','QU-520','Client A','Site A','','Inspection','821234567','client@example.test','Hi-Service','','No','No',''],['301','Michael','','Client B','Site B','','Solar visit','','','Flagship']];
 const rows=[['ID','Company','Date','Start','End','Technician','Data JSON','Updated','Created By']];
 const scheduled={getLastRow:()=>rows.length,appendRow:r=>rows.push(r),getRange:(r,col,n=1,w=1)=>({getValue:()=>rows[r-1]?.[col-1],getValues:()=>rows.slice(r-1,r-1+n).map(x=>x.slice(col-1,col-1+w)),setNumberFormat(){},setValues(values){values.forEach((x,i)=>{rows[r+i-1]??=[];x.forEach((v,j)=>rows[r+i-1][col+j-1]=v);});},createTextFinder:id=>({matchEntireCell(){return this;},useRegularExpression(){return this;},findNext(){const i=rows.findIndex((x,j)=>j>0&&x[0]===id);return i<0?null:{getRow:()=>i+1};}})})};
 const sheet={getLastRow:()=>jobs.length,getLastColumn:()=>headers.length,getRange:()=>({getDisplayValues:()=>jobs.map(x=>x.slice())})};
 const c={Date,JSON,Math,Error,isFinite,APP_PERMISSION_CATALOG_:{'Hi Service':[]},APP_PERMISSION_ACTIONS_:{},SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),getActiveSpreadsheet:()=>({getSheetByName:()=>scheduled})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},auth_:()=>({username:'manager',role:'Admin'}),permissionAllowed_:()=>true,log_:()=>{},ttSheet_:()=>scheduled};
 vm.createContext(c);for(const file of ['WorkCalendar','QuoteJobCalendar'])vm.runInContext(fs.readFileSync('apps-script/'+file+'.gs','utf8'),c);
 c.workCalendarEligibleUsers_=()=>[{username:'manager',name:'Michael',role:'Technician'}];c.workCalendarNotificationSheet_=()=>({});c.workCalendarCancelPending_=()=>{};c.workCalendarQueueNotification_=()=>{};c.workCalendarAppointmentStart_=()=>0;
 return {c,jobs,rows};
}
test('job number stays separate from the quote and invoice, and phone leading zero is restored',()=>{
 const {c}=backend(),j=c.quoteJobLookup_('300','Hi Service');assert.equal(j.jobNo,'300');assert.equal(j.customer,'Client A');assert.equal(j.phone,'0821234567');assert.equal(j.bookingId,'qjl-hi-300-sitevisit');assert.match(j.notes,/Inspection/);
});
test('company, missing job, duplicate numbers, malformed job IDs and missing customer are rejected',()=>{
 const {c,jobs}=backend();assert.throws(()=>c.quoteJobLookup_('300','Flagship Solar'),/another company/);assert.throws(()=>c.quoteJobLookup_('999','Hi Service'),/not found/);assert.throws(()=>c.quoteJobLookup_('QU-520','Hi Service'),/numeric/);jobs.push(jobs[1].slice());assert.throws(()=>c.quoteJobLookup_('300','Hi Service'),/Duplicate/);jobs.pop();jobs[1][3]='';assert.throws(()=>c.quoteJobLookup_('300','Hi Service'),/client name/);
});
test('header-based lookup survives insertion of the booking column',()=>{
 const {c,jobs}=backend();jobs.forEach(r=>r.splice(4,0,'extra'));assert.equal(c.quoteJobLookup_('300','Hi Service').site,'Site A');
});
test('lookup requires authentication, calendar read and scheduling permissions',()=>{
 const {c}=backend();c.auth_=()=>{throw Error('unknown user or password');};assert.throws(()=>c.quoteJobRead_({action:'hiQuoteJob',jobNo:'300'}),/unknown user/);c.auth_=()=>({role:'Admin'});c.permissionAllowed_=()=>false;assert.throws(()=>c.quoteJobRead_({action:'hiQuoteJob',jobNo:'300'}),/permission/);
});
test('both company scheduling routes accept real dates and reject invalid times',()=>{
 const {c}=backend(),e={id:'cal-12345678',customer:'Client',date:'2026-11-10',startTime:'08:00',endTime:'09:00',assignedUsernames:['manager']};
 assert.equal(c.workCalendarEvent_(e,'Hi Service').date,e.date);assert.equal(c.workCalendarEvent_(e,'Flagship Solar').jobNo,'');for(const bad of [{date:'2026-02-30'},{startTime:'24:00'},{endTime:'07:00'}])assert.throws(()=>c.workCalendarEvent_({...e,...bad},'Hi Service'));
});
test('repeat saves update one linked site visit, and reopening returns that booking',()=>{
 const {c,rows}=backend(),job=c.quoteJobLookup_('300','Hi Service');const event={id:job.bookingId,jobListId:job.jobListId,jobNo:'300',customer:'tampered',site:'tampered',date:'2026-11-10',startTime:'08:00',endTime:'09:00',assignedUsernames:['manager']};
 const first=c.workCalendarSave_({action:'hiScheduleJob',event});event.date='2026-11-11';c.workCalendarSave_({action:'hiScheduleJob',event});assert.equal(rows.length,2);const saved=JSON.parse(rows[1][6]);assert.equal(saved.customer,'Client A');assert.equal(saved.site,'Site A');assert.equal(saved.jobListId,job.jobListId);assert.equal(saved.jobType,'Site Visit');assert.equal(saved.date,'2026-11-11');assert.equal(c.quoteJobRead_({action:'hiQuoteJob',jobNo:'300'}).booking.id,first.id);
 assert.throws(()=>c.workCalendarSave_({action:'scheduleJob',event}),/another company/);assert.equal(rows.length,2);
});
test('forged source and booking ID fail before writing; company edits invalidate stale links',()=>{
 const {c,jobs,rows}=backend(),j=c.quoteJobLookup_('300','Hi Service');const e={id:j.bookingId,jobNo:'300',jobListId:j.jobListId};assert.throws(()=>c.quoteJobBindBooking_({...e,jobListId:'other'},'Hi Service'),/Unknown/);assert.throws(()=>c.quoteJobBindBooking_({...e,id:'cal-forged'},'Hi Service'),/does not match/);assert.throws(()=>c.quoteJobBindBooking_({id:j.bookingId},'Hi Service'),/reference/);jobs[1][9]='Flagship';assert.throws(()=>c.quoteJobBindBooking_(e,'Hi Service'),/another company/);assert.equal(rows.length,1);
});
function browser(hash,identity=''){
 const listeners={},status=[],fills=[],reads=[],location={hash,pathname:'/Hi-Service/',search:''};
 const w={location,history:{state:{},replaceState(state,title,url){location.hash=url.includes('#')?'#'+url.split('#')[1]:'';}},addEventListener:(name,fn)=>listeners[name]=fn};
 vm.runInNewContext(fs.readFileSync('quote-job-calendar.js','utf8'),{window:w,URLSearchParams});
 let who=identity,resolve;const a={company:'hi',identity:()=>who,allowed:()=>true,calendar(){},status:(...x)=>status.push(x),read:no=>{reads.push(no);return new Promise(r=>resolve=r);},fill:(...x)=>fills.push(x)};
 w.QuoteJobCalendar.init(a);return {w,a,status,fills,reads,listeners,setWho:x=>who=x,respond:r=>resolve(r)};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('booking link waits for login, retains the job, and loads once after sign-in',async()=>{
 const x=browser('#book-job=300&company=hi');assert.equal(x.reads.length,0);x.setWho('manager');x.listeners['app-session-ready']();assert.deepEqual(x.reads,['300']);x.respond({ok:true,job:{jobNo:'300'}});await tick();assert.equal(x.fills.length,1);x.listeners['app-session-ready']();assert.equal(x.reads.length,1);x.w.QuoteJobCalendar.clear();assert.equal(x.w.location.hash,'');
});
test('wrong company, invalid number and denied permission do not read client details',()=>{
 for(const hash of ['#book-job=300&company=fs','#book-job=QU520&company=hi']){const x=browser(hash,'manager');assert.equal(x.reads.length,0);assert.equal(x.fills.length,0);}const x=browser('#book-job=300&company=hi');x.a.allowed=()=>false;x.setWho('manager');x.listeners['app-session-ready']();assert.equal(x.reads.length,0);
});
test('stale responses after sign-out do not populate client details',async()=>{
 const x=browser('#book-job=300&company=hi','manager');x.setWho('');x.respond({ok:true,job:{jobNo:'300'}});await tick();assert.equal(x.fills.length,0);
});
test('network failure preserves the link and offers an explicit retry',async()=>{
 const x=browser('#book-job=300&company=hi','manager');x.respond({ok:false,error:'Unavailable'});await tick();const last=x.status.at(-1);assert.match(last[0],/Unavailable/);assert.equal(typeof last[1],'function');last[1]();assert.equal(x.reads.length,2);
});
test('inline HTML scripts and changed server scripts parse',()=>{
 for(const file of ['QuoteJobCalendar','WorkCalendar','AttendanceRoutes'])new vm.Script(fs.readFileSync('apps-script/'+file+'.gs','utf8'));
 const html=fs.readFileSync('index.html','utf8');for(const m of html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
 assert.equal((html.match(/src="\.\/quote-job-calendar\.js/g)||[]).length,1);
});
