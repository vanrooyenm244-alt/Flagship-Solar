const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Sync=require('../timesheet-sync.js');
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const A=Sync.owner('Michael','https://sheet-a/exec'),B=Sync.owner('Frank','https://sheet-a/exec');
const cycle='ts-2026-09',date='2026-09-23';
const row=(revision='v1',note='')=>({on:true,ti:'07:00',to:'17:00',lu:30,job:'Site',note,revision});
const data=(r=row())=>({Frank:{[date]:r}});
const ref=(revision='v1',worker='Frank',d=date)=>({worker,date:d,revision});
const ack=(rows,status='added')=>({ok:true,results:rows.map((r,index)=>({index,date:r.date,worker:r.worker,status}))});
function gate(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function fixture(){
  const records=new Map(),calls=[];let owner=A,online=true,tail=Promise.resolve();
  const io={
    read:async key=>clone(records.get(key)),
    change:(key,fn)=>{const p=tail.then(()=>{const s=fn(clone(records.get(key)));records.set(key,clone(s));return clone(s);});tail=p.catch(()=>{});return p;},
    currentOwner:()=>owner,online:()=>online,
    send:async(identity,rows)=>{calls.push({identity,rows:clone(rows)});return ack(rows);}
  };
  const engine=Sync.create(io);
  return {engine,io,calls,records,setOwner:v=>owner=v,setOnline:v=>online=v,
    seed:async(r=row())=>{await engine.saveCycle(A,cycle,data(r));await engine.enqueue(A,cycle,[ref(r.revision)]);},
    drain:()=>engine.drain(A,{user:'Michael',url:'https://sheet-a/exec',pass:'not-persisted'}),
    read:()=>engine.read(A)};
}
for(const status of ['added','updated','unchanged'])test('explicit '+status+' accepts only submitted revision',async()=>{
 const f=fixture();f.io.send=async(_,rows)=>ack(rows,status);await f.seed();await f.drain();const s=await f.read();assert.equal(s.queue.length,0);assert.equal(s.cycles[cycle].Frank[date].syncState,'accepted');assert.equal(s.cycles[cycle].Frank[date].sent,true);
});
for(const status of ['blocked','closed','skipped','failed','unexpected'])test(status+' stays recoverable and unsent',async()=>{
 const f=fixture();f.io.send=async(_,rows)=>ack(rows,status);await f.seed();await f.drain();const s=await f.read();assert.equal(s.queue.length,1);assert.equal(s.queue[0].status,'rejected');assert.ok(s.queue[0].reason);assert.equal(s.cycles[cycle].Frank[date].sent,false);
});
test('mixed results remove only accepted rows and preserve server reason',async()=>{
 const f=fixture(),d2='2026-09-24';await f.engine.saveCycle(A,cycle,{Frank:{[date]:row(),[d2]:row('v2')}});await f.engine.enqueue(A,cycle,[ref(),ref('v2','Frank',d2)]);
 f.io.send=async(_,rows)=>{const r=ack(rows);r.results[1].status='blocked';r.results[1].reason='Not your worker';return r;};await f.drain();const s=await f.read();assert.equal(s.queue.length,1);assert.equal(s.queue[0].row.date,d2);assert.equal(s.queue[0].reason,'Not your worker');assert.equal(s.cycles[cycle].Frank[date].sent,true);assert.equal(s.cycles[cycle].Frank[d2].sent,false);
});
test('offline is queued, never sent, reconnect drains',async()=>{const f=fixture();await f.seed();f.setOnline(false);await f.drain();assert.equal(f.calls.length,0);assert.equal((await f.read()).queue[0].status,'queued');f.setOnline(true);await f.drain();assert.equal(f.calls.length,1);});
test('API authorization error is retained, not called a network error or auto-retried',async()=>{const f=fixture();await f.seed();let calls=0;f.io.send=async()=>{calls++;return {ok:false,error:'not allowed'};};await f.drain();await f.drain();const s=await f.read();assert.equal(calls,1);assert.equal(s.queue[0].reason,'not allowed');assert.equal(s.queue[0].status,'failed');assert.equal(s.cycles[cycle].Frank[date].sent,false);});
test('network failure retained; explicit retry succeeds',async()=>{const f=fixture();await f.seed();f.io.send=async()=>{throw Error('Network request failed; delivery unconfirmed');};await f.drain();assert.equal((await f.read()).queue.length,1);await f.engine.enqueue(A,cycle,[ref()]);f.io.send=async(_,rows)=>ack(rows);await f.drain();assert.equal((await f.read()).queue.length,0);});
for(const kind of ['missing','wrong date','wrong worker','duplicate index','aggregate only'])test(kind+' acknowledgement never accepts',async()=>{
 const f=fixture();await f.seed();f.io.send=async(_,rows)=>{const j=ack(rows);if(kind==='missing')j.results=[];if(kind==='wrong date')j.results[0].date='2020-01-01';if(kind==='wrong worker')j.results[0].worker='Other';if(kind==='duplicate index')j.results.push(j.results[0]);if(kind==='aggregate only')return {ok:true,written:1};return j;};await f.drain();assert.equal((await f.read()).queue[0].status,'failed');
});
test('concurrent drain calls share one request',async()=>{const f=fixture(),g=gate(),started=gate();await f.seed();f.io.send=async(_,rows)=>{f.calls.push(rows);started.resolve();await g.promise;return ack(rows);};const p=f.drain();await started.promise;const p2=f.drain();assert.equal((await f.read()).queue[0].status,'in-flight');g.resolve();await Promise.all([p,p2]);assert.equal(f.calls.length,1);});
test('persistent batch guard blocks a second engine/tab',async()=>{const f=fixture(),g=gate(),started=gate();await f.seed();f.io.send=async(_,rows)=>{f.calls.push(rows);started.resolve();await g.promise;return ack(rows);};const p=f.drain();await started.promise;await Sync.create(f.io).drain(A,{});assert.equal(f.calls.length,1);g.resolve();await p;});
test('rows queued during a drain survive old acknowledgement',async()=>{const f=fixture(),g=gate(),started=gate(),d2='2026-09-24';await f.seed();f.io.send=async(_,rows)=>{started.resolve();await g.promise;return ack(rows);};const p=f.drain();await started.promise;await f.engine.saveCycle(A,cycle,{Frank:{[date]:row(),[d2]:row('v2')}});await f.engine.enqueue(A,cycle,[ref('v2','Frank',d2)]);g.resolve();await p;const s=await f.read();assert.equal(s.queue.length,1);assert.equal(s.queue[0].row.date,d2);assert.equal(s.queue[0].status,'queued');});
test('new edit supersedes old queued snapshot; stale data is never sent',async()=>{const f=fixture();await f.seed();await f.engine.saveCycle(A,cycle,data(row('v2','new')));await f.drain();assert.equal(f.calls.length,0);const s=await f.read();assert.equal(s.queue[0].status,'rejected');assert.match(s.queue[0].reason,/Superseded/);assert.equal(s.cycles[cycle].Frank[date].syncState,'draft');});
test('old in-flight acknowledgement cannot accept newer edit',async()=>{const f=fixture(),g=gate(),started=gate();await f.seed();f.io.send=async(_,rows)=>{started.resolve();await g.promise;return ack(rows);};const p=f.drain();await started.promise;await f.engine.saveCycle(A,cycle,data(row('v2','new')));await f.engine.enqueue(A,cycle,[ref('v2')]);g.resolve();await p;const s=await f.read();assert.equal(s.cycles[cycle].Frank[date].sent,false);assert.equal(s.cycles[cycle].Frank[date].revision,'v2');assert.equal(s.queue.length,1);assert.equal(s.queue[0].revision,'v2');});
test('deleting a draft prevents its queued replay',async()=>{const f=fixture();await f.seed();await f.engine.saveCycle(A,cycle,{});await f.drain();assert.equal(f.calls.length,0);assert.equal((await f.read()).queue[0].status,'rejected');});
test('different logged-in user or endpoint cannot drain original queue',async()=>{const f=fixture();await f.seed();f.setOwner(B);await f.drain();f.setOwner(Sync.owner('Michael','https://other/exec'));await f.drain();assert.equal(f.calls.length,0);assert.equal((await f.read()).queue[0].status,'queued');});
test('account switch during request preserves original acknowledgement scope',async()=>{const f=fixture(),g=gate(),started=gate();await f.seed();await f.engine.saveCycle(B,cycle,data(row('b')));f.io.send=async(identity,rows)=>{assert.equal(identity.user,'Michael');started.resolve();await g.promise;return ack(rows);};const p=f.drain();await started.promise;f.setOwner(B);g.resolve();await p;assert.equal((await f.engine.read(B)).cycles[cycle].Frank[date].syncState,'draft');assert.equal((await f.read()).cycles[cycle].Frank[date].syncState,'accepted');});
test('account changes after claiming batch but before fetch do not send',async()=>{const f=fixture();await f.seed();f.io.notify=()=>f.setOwner(B);await f.drain();assert.equal(f.calls.length,0);assert.equal((await f.read()).queue[0].status,'failed');});
for(const lunch of ['',null,undefined,-1,'bad'])test('ambiguous/invalid lunch '+String(lunch)+' is never submitted',async()=>{const f=fixture(),r=row();r.lu=lunch;await f.engine.saveCycle(A,cycle,data(r));await assert.rejects(f.engine.enqueue(A,cycle,[ref()]),/explicit lunch/);assert.equal(f.calls.length,0);});
test('explicit lunch zero reaches server as zero',async()=>{const f=fixture(),r=row();r.lu='0';await f.seed(r);await f.drain();assert.equal(f.calls[0].rows[0].lunch,0);});
test('blank lunch in mixed queue request prevents partial enqueue',async()=>{const f=fixture(),d2='2026-09-24',r=row('v2');r.lu='';await f.engine.saveCycle(A,cycle,{Frank:{[date]:row(),[d2]:r}});await assert.rejects(f.engine.enqueue(A,cycle,[ref(),ref('v2','Frank',d2)]));assert.equal((await f.read()).queue.length,0);});
test('stale second-tab cycle save cannot replace newer edits',async()=>{const f=fixture();await f.engine.saveCycle(A,cycle,data(),0);await assert.rejects(f.engine.saveCycle(A,cycle,data(row('v2')),0),/another tab/);assert.equal((await f.read()).cycles[cycle].Frank[date].revision,'v1');});
test('same revision cannot disguise changed payload',async()=>{const f=fixture();await f.engine.saveCycle(A,cycle,data());await assert.rejects(f.engine.saveCycle(A,cycle,data(row('v1','changed'))),/new revision/);});
test('cycle isolation and caller snapshot mutation',async()=>{const f=fixture(),d=data();const p=f.engine.saveCycle(A,cycle,d);d.Frank[date].note='mutated';await p;await f.engine.saveCycle(A,'ts-2026-10',data(row('oct')));const s=await f.read();assert.equal(s.cycles[cycle].Frank[date].note,'');assert.equal(s.cycles['ts-2026-10'].Frank[date].revision,'oct');});
test('interrupted request stays held until explicit recovery then retry',async()=>{const f=fixture();await f.seed();await f.io.change(A,s=>{s.busy='interrupted';s.queue[0].status='in-flight';return s;});await f.drain();assert.equal(f.calls.length,0);await f.engine.recover(A);assert.equal((await f.read()).queue[0].status,'failed');await f.drain();assert.equal(f.calls.length,0);await f.engine.enqueue(A,cycle,[ref()]);await f.drain();assert.equal(f.calls.length,1);});
test('persistent storage failure never submits',async()=>{const f=fixture();await f.seed();f.io.change=async()=>{throw Error('quota');};await assert.rejects(f.drain(),/quota/);assert.equal(f.calls.length,0);});
test('credentials never enter persisted queue state',async()=>{const f=fixture();await f.seed();await f.drain();assert.ok(!JSON.stringify([...f.records]).includes('not-persisted'));});
test('frontend scripts parse and storage protections remain intact',()=>{
 const h=fs.readFileSync('index.html','utf8');for(const m of h.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
 // Calculation equivalence is now covered by Repair 3 tests.
 assert.ok(h.includes("store.put({id:tsRecord_(account),state:value})"));assert.ok(h.includes('transaction.oncomplete=function(){resolve(value);}'));
 assert.ok(!h.includes("put('cfg',{id:'queue',rows:[]})"));
});

function frontend(){
 const html=fs.readFileSync('index.html','utf8'),elements={};
 const ctx={FlagshipTimesheetSync:Sync,ME:{username:'Michael',name:'Michael',role:'Admin'},CFG:{url:'https://sheet-a/exec'},MEM:false,DB:null,
   navigator:{onLine:true},window:{addEventListener(){}},get1:async()=>undefined,
   document:{getElementById:id=>elements[id]||(elements[id]={addEventListener(){},style:{},textContent:'',innerHTML:''})},
   confirm:()=>false,alert(){},console,fetch:async()=>{throw Error('unexpected fetch');}};
 ctx.FlagshipTimesheetSync={...Sync,create:io=>{ctx.transport=io;return Sync.create(io);}};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('var WORKERS=[], CYCLE='),html.indexOf('/* ============ boot ============ */')),ctx);
 ctx.renderPeople=()=>{};ctx.renderCycle=()=>{};ctx.renderQueue=async()=>{};
 ctx.TSOWNER=A;ctx.TSCYCLE=cycle;ctx.CYCLE={y:2026,m:8};ctx.ENTRIES=data();return ctx;
}
test('frontend pending save remains bound to original cycle and captured values',async()=>{
 const ctx=frontend(),g=gate(),started=gate(),writes=[];
 ctx.TSSYNC={saveCycle:async(account,c,data)=>{writes.push({account,cycle:c,data:clone(data)});started.resolve();await g.promise;return {cycles:{[c]:data},versions:{[c]:1}};}};
 const p=ctx.saveEntries();await started.promise;ctx.CYCLE={y:2026,m:9};ctx.TSCYCLE='ts-2026-10';ctx.ENTRIES=data(row('oct','October'));g.resolve();await p;
 assert.equal(writes[0].cycle,cycle);assert.equal(writes[0].data.Frank[date].note,'');assert.equal(ctx.ENTRIES.Frank[date].note,'October');
});
test('cycle navigation waits for save commit before loading next cycle',async()=>{
 const ctx=frontend(),g=gate(),started=gate();ctx.TSSYNC={saveCycle:async(a,c,d)=>{started.resolve();await g.promise;return {cycles:{[c]:d},versions:{[c]:1}};},read:async()=>({cycles:{}})};
 const saving=ctx.saveEntries();await started.promise;const moving=ctx.tsMoveCycle_(1);await Promise.resolve();assert.equal(ctx.CYCLE.m,8);g.resolve();await saving;await moving;assert.equal(ctx.CYCLE.m,9);assert.equal(ctx.TSCYCLE,'ts-2026-10');
});
test('failed draft persistence blocks cycle change and queue drain',async()=>{
 const ctx=frontend();ctx.TSSYNC={saveCycle:async()=>{throw Error('quota exceeded');},drain:async()=>{throw Error('must not drain');}};
 await assert.rejects(ctx.saveEntries(),/quota/);await ctx.tsMoveCycle_(1);assert.equal(ctx.CYCLE.m,8);await assert.rejects(ctx.flushQueue(),/quota/);assert.ok(ctx.ENTRIES.Frank[date]);
});
test('frontend never writes legacy queue and only imports legacy drafts after confirmation',async()=>{
 const ctx=frontend();ctx.TSSYNC={read:async()=>({cycles:{}}),saveCycle:async()=>{throw Error('should not import');}};ctx.get1=async()=>({data:data()});await ctx.loadEntries();assert.equal(Object.keys(ctx.ENTRIES).length,0);
});
test('Timesheet storage resolves only after transaction commit, not request success',async()=>{
 const ctx=frontend();let tx,pending,settled=false;
 ctx.DB={transaction:()=>{tx={objectStore:()=>({get:()=>{const request={};queueMicrotask(()=>{request.result=undefined;request.onsuccess();});return request;},put:v=>{pending=v;}})};return tx;}};
 const p=ctx.tsChange_(A,()=>({cycles:{},queue:[]})).then(()=>settled=true);await new Promise(r=>setImmediate(r));assert.ok(pending);assert.equal(settled,false);tx.oncomplete();await p;assert.equal(settled,true);
});
test('transaction abort never reports save success',async()=>{
 const ctx=frontend();let tx;
 ctx.DB={transaction:()=>{tx={objectStore:()=>({get:()=>{const request={};queueMicrotask(()=>{request.onsuccess();});return request;},put(){}})};return tx;}};
 const p=ctx.tsChange_(A,()=>({cycles:{},queue:[]}));await new Promise(r=>setImmediate(r));tx.error=Error('commit failed');tx.onabort();await assert.rejects(p,/commit failed/);
});
test('HTTP server errors are not described as offline',async()=>{const ctx=frontend();ctx.fetch=async()=>({ok:false,status:503});await assert.rejects(ctx.transport.send({url:'u',user:'Michael',pass:'p'},[]),/Server HTTP 503/);});
test('invalid JSON response remains unconfirmed',async()=>{const ctx=frontend();ctx.fetch=async()=>({ok:true,json:async()=>{throw Error('html');}});await assert.rejects(ctx.transport.send({url:'u'},[]),/Invalid server response; delivery is unconfirmed/);});
test('transport uses captured credentials rather than newly logged-in user',async()=>{const ctx=frontend();ctx.ME={username:'Different',pass:'new'};ctx.fetch=async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.user,'Michael');assert.equal(body.pass,'original');return {ok:true,json:async()=>({ok:true,results:[]})};};await ctx.transport.send({url:'original-url',user:'Michael',pass:'original'},[]);});

test('server import records existing work without accepting or queueing a submission',async()=>{
 const f=fixture();await f.engine.importServer(A,cycle,data({...row(),sent:true}),0);let s=await f.read();const r=s.cycles[cycle].Frank[date];assert.equal(r.syncState,'recorded');assert.equal(r.sent,false);assert.equal(r._fingerprint,Sync.fingerprint('Frank',date,r));await f.engine.enqueue(A,cycle,[ref(r.revision)]);assert.equal((await f.read()).queue.length,0);
});
test('server import never overwrites draft or accepted local revisions',async()=>{
 const f=fixture();await f.seed();let s=await f.read();await f.engine.importServer(A,cycle,data(row('server','remote')),s.versions[cycle]);assert.equal((await f.read()).cycles[cycle].Frank[date].revision,'v1');await f.drain();s=await f.read();await f.engine.importServer(A,cycle,data(row('server','remote')),s.versions[cycle]);assert.equal((await f.read()).cycles[cycle].Frank[date].revision,'v1');assert.equal((await f.read()).cycles[cycle].Frank[date].syncState,'accepted');
});
test('server import ignores stale cycle versions and other accounts',async()=>{
 const f=fixture();await f.engine.saveCycle(A,cycle,data());await f.engine.importServer(A,cycle,{Other:{[date]:row()}},0);assert.equal((await f.read()).cycles[cycle].Other,undefined);f.setOwner(B);await f.engine.importServer(A,cycle,{Other:{[date]:row()}},1);assert.equal((await f.read()).cycles[cycle].Other,undefined);
});
test('server import rejects wrong-cycle and invalid dates and retains held queue evidence',async()=>{
 const f=fixture();await f.seed();await f.engine.saveCycle(A,cycle,{});const s=await f.read();await f.engine.importServer(A,cycle,{Frank:{[date]:row()},Other:{'2026-09-25':row(),'2026-02-30':row()}},s.versions[cycle]);const end=await f.read();assert.equal(end.cycles[cycle].Frank,undefined);assert.equal(end.cycles[cycle].Other,undefined);assert.equal(end.queue.length,1);
});
test('editing a server-recorded row creates a draft requiring its own acknowledgement',async()=>{
 const f=fixture();await f.engine.importServer(A,cycle,data(),0);let s=await f.read();await f.engine.saveCycle(A,cycle,data(row('edited','change')),s.versions[cycle]);assert.equal((await f.read()).cycles[cycle].Frank[date].syncState,'draft');await f.engine.enqueue(A,cycle,[ref('edited')]);await f.drain();assert.equal((await f.read()).cycles[cycle].Frank[date].syncState,'accepted');
});
test('frontend server read captures cycle and credentials and discards late cycle response',async()=>{
 const c=frontend(),g=gate();let imports=0;c.TSSYNC={read:async()=>({versions:{[cycle]:0}}),importServer:async()=>{imports++;}};c.ME.pass='original';c.fetch=async url=>{assert.ok(url.includes('cycle=2026-09'));assert.ok(url.includes('pass=original'));await g.promise;return {ok:true,json:async()=>({ok:true,cycle:'2026-09',entries:data()})};};const p=c.fetchTimesheetAll();await new Promise(r=>setImmediate(r));c.TSCYCLE='ts-2026-10';g.resolve();await p;assert.equal(imports,0);
});
test('frontend server read discards response after account switch',async()=>{
 const c=frontend(),g=gate();let imports=0;c.TSSYNC={read:async()=>({versions:{}}),importServer:async()=>{imports++;}};c.fetch=async()=>{await g.promise;return {ok:true,json:async()=>({ok:true,cycle:'2026-09',entries:data()})};};const p=c.fetchTimesheetAll();await new Promise(r=>setImmediate(r));c.ME.username='Different';g.resolve();await p;assert.equal(imports,0);
});
test('frontend server read rejects mismatched response cycle',async()=>{
 const c=frontend();c.TSSYNC={read:async()=>({versions:{}})};c.fetch=async()=>({ok:true,json:async()=>({ok:true,cycle:'2026-10',entries:{}})});await assert.rejects(c.fetchTimesheetAll(),/Mismatched/);
});
test('frontend server read does not replace in-memory edits saved during import',async()=>{
 const c=frontend(),g=gate(),started=gate();c.TSSYNC={read:async()=>({versions:{}}),importServer:async()=>{started.resolve();await g.promise;return {cycles:{[cycle]:data(row('remote'))},versions:{[cycle]:1}};}};c.fetch=async()=>({ok:true,json:async()=>({ok:true,cycle:'2026-09',entries:data()})});const p=c.fetchTimesheetAll();await started.promise;c.ENTRIES=data(row('new-edit'));c.TSSAVE=c.TSSAVE.then(()=>{});g.resolve();await p;assert.equal(c.ENTRIES.Frank[date].revision,'new-edit');
});
