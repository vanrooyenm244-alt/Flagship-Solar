const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('apps-script/Code.gs', 'utf8');
const stock = fs.readFileSync('apps-script/Stock.gs', 'utf8');
new vm.Script(code); new vm.Script(stock);
let passed = 0;
function fixture() {
  const writes = [], errors = [], sheets = [];
  const ctx = {console:{error:s=>errors.push(s)}};
  vm.createContext(ctx); vm.runInContext(code + '\n' + stock, ctx);
  function sheet(name, rows, marked) {
    const sh = {name, rows:rows.map(r=>Array.from(r)), tags:[],
      getName(){return this.name;}, getLastRow(){return this.rows.length;},
      getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length));},
      getDeveloperMetadata(){return this.tags.map(t=>({getKey:()=>t[0],getValue:()=>t[1]}));},
      addDeveloperMetadata(k,v){writes.push([name,'metadata']);this.tags.push([k,v]);return this;},
      setFrozenRows(){writes.push([name,'freeze']);},setColumnWidth(){writes.push([name,'width']);},
      getRange(row,col,n=1,m=1){const self=this;return {
        getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>self.rows[row-1+i]?.[col-1+j]??''));},
        getFormulas(){return Array.from({length:n},()=>Array(m).fill(''));},
        setValues(values){writes.push([name,'write']);values.forEach((r,i)=>{self.rows[row-1+i]??=[];r.forEach((v,j)=>self.rows[row-1+i][col-1+j]=v);});return this;},
        clearContent(){writes.push([name,'clear']);for(let i=0;i<n;i++)self.rows[row-1+i]=Array(m).fill('');return this;},
        setNumberFormat(){writes.push([name,'format']);return this;},
        setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;},sort(){writes.push([name,'sort']);}
      };}
    };
    if(marked)sh.tags.push([ctx.WORKER_TAB_OWNER_,marked]);sheets.push(sh);return sh;
  }
  const ss={getSheets:()=>sheets,getSheetByName:n=>sheets.find(s=>s.name===n),insertSheet:n=>{writes.push([n,'insert']);return sheet(n,[]);}};
  ctx.SpreadsheetApp={getActiveSpreadsheet:()=>ss};ctx.log_=()=>{};
  ctx.rebuildSummary=()=>writes.push(['Summary','rebuild']);
  const row=w=>['2026-09-23','Wednesday','Weekday',w,'site','07:00','17:00',30,9.5,0,9.5,'','admin','stamp'];
  const master=sheet('Timesheets',[Array.from(ctx.SHEETS.Timesheets)]);
  return {ctx,writes,errors,sheet,master,row};
}
function test(name,fn){fn();passed++;console.log('PASS '+name);}
function blocked(f,fn){assert.throws(fn,/Worker tab protection:/);assert.deepEqual(f.writes,[]);assert.ok(f.errors.length);}
const reserved=['Users','Timesheets','Workers','Prices','Log','Proposals','JobCards','Summary','Sheet1','Stock'];
for(const name of reserved)for(const variant of [name,name.toLowerCase(),name.toUpperCase(),'  '+name+'  ']) {
  test('reserved '+JSON.stringify(variant),()=>{
    const f=fixture();if(name!=='Timesheets')f.sheet(name,[['important'],['keep']]);
    f.master.rows.push(f.row(variant));blocked(f,()=>f.ctx.rebuildWorkerTabs());
  });
}
test('reserved list derives from all backend business constants',()=>{
 const f=fixture();assert.deepEqual(Array.from(f.ctx.reservedWorkerTabs_()).sort(),reserved.map(s=>s.toLowerCase()).sort());
});
test('direct workerSheet cannot bypass reserved check',()=>{const f=fixture();blocked(f,()=>f.ctx.workerSheet_('Users'));});
test('direct master write blocked before any write',()=>{const f=fixture();blocked(f,()=>f.ctx.writeEntry_({username:'admin'},{worker:'Users',date:'2026-09-23',timeIn:'07:00',timeOut:'17:00'}));});
test('unrelated existing sheet preserved',()=>{const f=fixture();const sh=f.sheet('Frank',[['Budget'],[900]]);f.master.rows.push(f.row('Frank'));blocked(f,()=>f.ctx.rebuildWorkerTabs());assert.equal(sh.rows[1][0],900);});
test('unowned header-only template is not adopted',()=>{const f=fixture();f.sheet('Frank',[Array.from(f.ctx.WORKER_COLS)]);f.master.rows.push(f.row('Frank'));blocked(f,()=>f.ctx.rebuildWorkerTabs());});
test('unowned worker-shaped unrelated data is preserved',()=>{const f=fixture();f.sheet('Frank',[Array.from(f.ctx.WORKER_COLS),Array(13).fill('unrelated')]);f.master.rows.push(f.row('Frank'));blocked(f,()=>f.ctx.rebuildWorkerTabs());});
test('new normal worker rebuild',()=>{const f=fixture();f.master.rows.push(f.row('Frank'));assert.equal(f.ctx.rebuildWorkerTabs(),'Rebuilt 1 worker tabs.');assert.ok(f.writes.some(x=>x[0]==='Frank'&&x[1]==='write'));});
test('normal whitespace is trimmed',()=>{const f=fixture();f.master.rows.push(f.row('  Frank  '));f.ctx.rebuildWorkerTabs();assert.ok(f.writes.some(x=>x[0]==='Frank'));});
test('verified legacy worker retains behavior and gains ownership',()=>{const f=fixture();const r=f.row('Frank');f.master.rows.push(r);const sh=f.sheet('Frank',[Array.from(f.ctx.WORKER_COLS),Array.from(f.ctx.workerProjection_(r))]);f.ctx.rebuildWorkerTabs();assert.equal(sh.tags[0][1],'Frank');assert.deepEqual(sh.rows[1],Array.from(f.ctx.workerProjection_(r)));});
test('owned normal worker rebuild',()=>{const f=fixture();f.master.rows.push(f.row('Frank'));f.sheet('Frank',[Array.from(f.ctx.WORKER_COLS),Array(13).fill('old')],'Frank');f.ctx.rebuildWorkerTabs();assert.ok(f.writes.some(x=>x[1]==='clear'));});
test('ownership mismatch blocks',()=>{const f=fixture();f.sheet('Frank',[Array.from(f.ctx.WORKER_COLS)],'Other');blocked(f,()=>f.ctx.workerSheet_('Frank'));});
test('batch preflight prevents earlier valid destination mutations',()=>{const f=fixture();f.master.rows.push(f.row('Frank'),f.row('Users'));blocked(f,()=>f.ctx.rebuildWorkerTabs());});
test('sanitized system name blocked',()=>{const f=fixture();blocked(f,()=>f.ctx.workerSheet_('Us/ers'));});
test('sanitized worker collision blocked',()=>{const f=fixture();f.master.rows.push(f.row('A/B'),f.row('AB'));blocked(f,()=>f.ctx.rebuildWorkerTabs());});
test('case-only worker collision blocked',()=>{const f=fixture();f.master.rows.push(f.row('Frank'),f.row('FRANK'));blocked(f,()=>f.ctx.rebuildWorkerTabs());});
test('truncated worker collision blocked',()=>{const f=fixture();blocked(f,()=>f.ctx.preflightWorkerTabs_(['A'.repeat(90)+'B','A'.repeat(90)+'C']));});
test('POST entire batch rejected before master write',()=>{const f=fixture();f.ctx.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};f.ctx.auth_=()=>({role:'Admin'});f.ctx.out_=x=>x;const result=f.ctx.doPost({postData:{contents:JSON.stringify({action:'timesheets',rows:[{worker:'Frank'},{worker:'Users'}]})}});assert.equal(result.ok,false);assert.match(result.error,/reserved tab/);assert.deepEqual(f.writes,[]);});
test('addWorker rejects reserved before directory write',()=>{const f=fixture();f.ctx.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};f.ctx.auth_=()=>({role:'Admin'});f.ctx.out_=x=>x;const result=f.ctx.doPost({postData:{contents:JSON.stringify({action:'addWorker',name:'Users'})}});assert.equal(result.ok,false);assert.deepEqual(f.writes,[]);});
test('time repair rejects collision before formatting',()=>{const f=fixture();f.master.rows.push(f.row('Users'));blocked(f,()=>f.ctx.fixExistingTimes());});
test('legacy ownership not changed when later destination fails',()=>{const f=fixture();const r=f.row('Frank');f.master.rows.push(r,f.row('Users'));f.sheet('Frank',[Array.from(f.ctx.WORKER_COLS),Array.from(f.ctx.workerProjection_(r))]);blocked(f,()=>f.ctx.rebuildWorkerTabs());});
test('legacy preflight permits later legitimate master update',()=>{const f=fixture();const r=f.row('Frank');f.master.rows.push(r);const sh=f.sheet('Frank',[Array.from(f.ctx.WORKER_COLS),Array.from(f.ctx.workerProjection_(r))]);f.ctx.preflightWorkerTabs_(['Frank']);r[4]='new site';f.ctx.rebuildWorkerTabs();assert.equal(sh.rows[1][3],'new site');});
console.log(`${passed} tests passed; no Google services called.`);
