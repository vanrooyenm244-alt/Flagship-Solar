const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const front={DAYNAMES:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']};
vm.createContext(front);
vm.runInContext(html.slice(html.indexOf('/* Repair 3:'),html.indexOf('function hm(h)')),front);
const back={};vm.createContext(back);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),back);
const plain=x=>JSON.parse(JSON.stringify(x));
function calculate(date,start,end,lunch){
 const f=plain(front.calcShift(date,start,end,lunch)),b=plain(back.calc_(date,start,end,lunch));
 assert.deepEqual(f,b,'frontend and backend must agree');return f;
}
const cases=[
 ['ordinary day','2026-09-23','07:00','17:00',0,10,0,10],
 ['before-boundary failure','2026-09-23','04:00','05:00',0,0,1,1],
 ['after-boundary failure','2026-09-23','18:00','19:00',0,0,1,1],
 ['overnight failure','2026-09-23','22:00','02:00',0,0,4,4],
 ['early to normal','2026-09-23','04:00','08:00',0,2,2,4],
 ['normal to late','2026-09-23','16:00','19:00',0,1,2,3],
 ['all three bands','2026-09-23','04:00','19:00',0,11,4,15],
 ['overnight with next-day normal','2026-09-23','16:00','08:00',0,3,13,16],
 ['explicit thirty-minute lunch','2026-09-23','07:00','17:00',30,9.5,0,9.5],
 ['explicit string zero','2026-09-23','07:00','17:00','0',10,0,10],
 ['explicit lunch in mixed shift','2026-09-23','04:00','19:00',30,10.5,4,14.5],
 ['documented early normal hour','2026-09-23','06:00','07:00',0,1,0,1],
 ['exact normal boundaries','2026-09-23','06:00','17:00',0,11,0,11],
 ['one minute across start','2026-09-23','05:59','06:01',0,0.02,0.02,0.03],
 ['one minute across end','2026-09-23','16:59','17:01',0,0.02,0.02,0.03],
 ['before normal ends exactly','2026-09-23','05:59','06:00',0,0,0.02,0.02],
 ['normal starts exactly','2026-09-23','06:00','06:01',0,0.02,0,0.02],
 ['normal ends exactly','2026-09-23','16:59','17:00',0,0.02,0,0.02],
 ['overtime starts exactly','2026-09-23','17:00','17:01',0,0,0.02,0.02],
 ['midnight boundary','2026-09-23','23:59','00:01',0,0,0.03,0.03],
 ['end at midnight','2026-09-23','22:00','00:00',0,0,2,2],
 ['start at midnight','2026-09-23','00:00','06:00',0,0,6,6],
 ['equal times means zero elapsed','2026-09-23','07:00','07:00',0,0,0,0],
 ['Saturday daytime','2026-09-26','07:00','17:00',30,0,9.5,9.5],
 ['Sunday daytime','2026-09-27','07:00','17:00',0,0,10,10],
 ['weekend overnight','2026-09-26','22:00','02:00',0,0,4,4],
 ['month rollover on weekdays','2026-09-30','22:00','02:00',0,0,4,4],
 ['year rollover on weekdays','2026-12-31','22:00','02:00',0,0,4,4],
 ['valid leap date','2024-02-29','07:00','17:00',0,10,0,10]
];
for(const [name,date,start,end,lunch,normal,overtime,total] of cases)test(name,()=>{
 const r=calculate(date,start,end,lunch);assert.ok(r);assert.equal(r.normal,normal);assert.equal(r.overtime,overtime);assert.equal(r.total,total);assert.equal(r.lunch,Number(lunch));
});
for(const lunch of ['',null,undefined,-1,Infinity,NaN,'invalid',601])test('invalid/ambiguous lunch '+String(lunch),()=>assert.equal(calculate('2026-09-23','07:00','17:00',lunch),null));
for(const [date,start,end] of [
 ['2026-02-30','07:00','17:00'],['2025-02-29','07:00','17:00'],['bad','07:00','17:00'],
 ['2026-09-23','24:00','17:00'],['2026-09-23','07:60','17:00'],['2026-09-23','07:00','25:00'],
 ['2026-09-23','07:00junk','17:00'],['2026-09-23','','17:00']
])test('invalid date/time '+[date,start,end].join(' '),()=>assert.equal(calculate(date,start,end,0),null));
test('all minute-band sample intervals conserve actual elapsed minutes before rounding',()=>{
 const values=[0,1,240,359,360,361,420,1019,1020,1021,1140,1320,1439];
 const hhmm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 for(const start of values)for(const end of values){
   const r=calculate('2026-09-23',hhmm(start),hhmm(end),0),elapsed=(end<start?end+1440:end)-start;
   assert.ok(r);assert.equal(r.total,Math.round(elapsed/60*100)/100);assert.ok(r.normal>=0&&r.overtime>=0);
   assert.ok(Math.abs(r.normal+r.overtime-r.total)<=0.011);
 }
});

test('approved starting-day classification crosses Friday and Sunday boundaries',()=>{
 const friday=calculate('2026-09-25','16:00','08:00',0);assert.equal(friday.dayType,'Weekday');assert.equal(friday.normal,3);assert.equal(friday.overtime,13);
 const sunday=calculate('2026-09-27','16:00','08:00',30);assert.equal(sunday.dayType,'Sunday');assert.equal(sunday.normal,0);assert.equal(sunday.overtime,15.5);
});
test('weekday excess lunch requires review, including overtime-only shifts',()=>{
 for(const [a,b,l] of [['04:00','05:00',30],['18:00','19:00',1],['05:00','06:10',11],['22:00','02:00',30]]){
  assert.equal(calculate('2026-09-23',a,b,l),null);
  assert.match(front.shiftReviewReason('2026-09-23',a,b,l),/Review required: weekday lunch exceeds/);
  assert.equal(front.shiftReviewReason('2026-09-23',a,b,l),back.shiftReviewReason_('2026-09-23',a,b,l));
 }
});
test('lunch exactly normal minutes is deducted without assigning any to overtime',()=>{
 const r=calculate('2026-09-23','05:00','06:10',10);assert.equal(r.normal,0);assert.equal(r.overtime,1);assert.equal(r.total,1);
 assert.equal(calculate('2026-09-23','07:00','07:00',1),null);
});
test('calculation cores are identical and all application JavaScript parses',()=>{
 const gs=fs.readFileSync('apps-script/Code.gs','utf8');
 const core=s=>s.slice(s.indexOf('/* Repair 3:'),s.indexOf('\nfunction mins',s.indexOf('/* Repair 3:'))).replace(/\r/g,'');
 assert.equal(core(html),core(gs));
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
 for(const p of fs.readdirSync('.').filter(p=>p.endsWith('.js')).concat(['apps-script/Code.gs','apps-script/Stock.gs']))new vm.Script(fs.readFileSync(p,'utf8'),{filename:p});
});
test('Apps Script Date time inputs retain compatibility',()=>{
 assert.deepEqual(plain(vm.runInContext("calc_('2026-09-23',new Date(2026,8,23,7,0),new Date(2026,8,23,17,0),0)",back)),calculate('2026-09-23','07:00','17:00',0));
});
test('backend write path persists corrected amounts and skips review rows with a reason',()=>{
 const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),ctx);
 const writes=[];ctx.preflightWorkerTabs_=()=>{};ctx.findEntry_=()=>null;ctx.log_=()=>{};
 ctx.sheet_=()=>({appendRow:r=>writes.push(plain(r))});
 const row={worker:'Frank',date:'2026-09-23',timeIn:'22:00',timeOut:'02:00',lunch:0};
 assert.equal(ctx.writeEntry_({username:'admin'},row).added,true);assert.deepEqual(writes[0].slice(7,11),[0,0,4,4]);
 const rejected=ctx.writeEntry_({username:'admin'},{...row,lunch:30});assert.equal(rejected.skipped,true);assert.match(rejected.reason,/Review required/);assert.equal(writes.length,1);
 ctx.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};ctx.auth_=()=>({role:'Admin',username:'admin'});ctx.out_=x=>x;ctx.isCurrentCycle_=()=>true;
 const response=ctx.doPost({postData:{contents:JSON.stringify({action:'timesheets',rows:[{...row,lunch:30}]})}});
 assert.equal(response.ok,true);assert.equal(response.results[0].status,'skipped');assert.equal(response.results[0].index,0);assert.match(response.results[0].reason,/Review required/);assert.equal(writes.length,1);
});
