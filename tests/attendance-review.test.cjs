const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('apps-script/TimesheetAudit.gs','utf8');new vm.Script(source);
// Admin correction must validate freshness and role before any payroll write.
let writes=0;const worker={username:'worker',role:'Worker'},ctx={auth_:()=>worker};vm.createContext(ctx);vm.runInContext(source,ctx);
assert.throws(()=>ctx.tsManage_({}),/Only Admin/);
ctx.auth_=()=>({username:'admin',role:'Admin'});assert.throws(()=>ctx.tsManage_({operation:'cancel',reason:''}),/reason/);
let released=false;ctx.LockService={getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>released=true})};ctx.tsRecords_=()=>({entries:[]});assert.throws(()=>ctx.tsManage_({operation:'cancel',reason:'Wrong Sunday',version:'stale'}),/changed/);assert(released);
// Pending correction retains original submitter; exact original goes to audit before save.
const old={id:'id',worker:'Person',date:'2026-10-24',status:'Pending',version:'v1',submittedBy:'employee'};let record=['id','Person','2026-10-24','{}','employee','date','Pending','','',''];let audit=[];
ctx.tsRecords_=()=>({entries:[old]});ctx.tsApprovalSheet_=()=>({getLastRow:()=>2,getRange:()=>({getValues:()=>[record],setValues:()=>{writes++;}})});ctx.tsAudit_=(...a)=>audit.push(a);ctx.hiClockToday_=()=> '2026-10-25';ctx.calc_=()=>({overtime:0});ctx.shiftReviewReason_=()=>'';
ctx.tsManage_({operation:'correct',reason:'Incorrect Saturday',version:'v1',entry:{date:'2026-10-23',timeIn:'07:00',timeOut:'17:00',lunch:60}});assert.equal(audit.length,1);assert.equal(audit[0][5].submittedBy,'employee');assert.equal(writes,2);
console.log('PASS backend: source syntax, worker forbidden, mandatory reason, stale edit blocked, original audit and submitter preserved');
let deleted=0,rebuilt=0;old.status='Approved';old.id='';record[6]='Approved';ctx.dateStr_=String;ctx.findEntry_=()=>2;ctx.preflightWorkerTabs_=()=>{};ctx.sheet_=()=>({deleteRow:()=>deleted++});ctx.rebuildWorkerTabs=()=>rebuilt++;
ctx.tsManage_({operation:'cancel',reason:'Employee did not work',version:'v1'});assert.equal(deleted,1);assert.equal(rebuilt,1);assert.equal(audit.length,2);assert.equal(audit[1][5].status,'Approved');assert.equal(audit[1][6],null);
const data=[['2026-10-23','Fri','Weekday','Own employee','Office','07:00','17:00',60,9,0,9,'','admin','date'],['2026-10-23','Fri','Weekday','Other employee','Office','07:00','17:00',60,9,0,9,'','admin','date']];ctx.auth_=()=>worker;ctx.canonicalWorkerForUser_=()=> 'Own employee';ctx.permissionCompany_=()=> 'Flagship Solar';ctx.permissionAllowed_=()=>true;ctx.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:n=>n==='Timesheets'?{getLastRow:()=>3,getRange:()=>({getValues:()=>data})}:null})};ctx.timeTxt_=String;ctx.dateStr_=String;ctx.cycleKey_=()=> '2026-10';ctx.cycleOf_=()=>({});vm.runInContext(source,ctx);const own=ctx.tsRecords_({});assert.equal(own.entries.length,1);assert.equal(own.entries[0].worker,'Own employee');
console.log('PASS approved cancellation keeps audit, excludes payroll, rebuilds derivative; worker reads only own records');
