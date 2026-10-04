const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const baseline='f987198';
const original=p=>cp.execFileSync('git',['show',baseline+':'+p],{encoding:'utf8'});
test('main HTML keeps baseline IDs while allowing intentional completion UI additions',()=>{
 const current=fs.readFileSync('index.html','utf8'),base=original('index.html');
 const ids=x=>[...x.matchAll(/\\bid=["']([^"']+)["']/g)].map(m=>m[1]);
 for(const id of ids(base))assert.ok(ids(current).includes(id),'lost baseline DOM id '+id);
 assert.ok(current.includes('id="usrPerms"'),'missing Users permission panel');
});
test('main screens, navigation targets and runtime assets remain present',()=>{
 const current=fs.readFileSync('index.html','utf8'),main=original('index.html');
 const ids=s=>[...s.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
 for(const id of ids(main))assert.ok(ids(current).includes(id),'lost DOM id '+id);
 for(const f of ['manifest.webmanifest','supabase-config.js','fs-install-check.html','Flagship_Price_Updater_V3_1 (1).html'])assert.equal(fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'),original(f).replace(/\r\n/g,'\n'),f+' changed');
});
function worker(){const handlers={},removed=[],cached=[];const active=fs.readFileSync('sw.js','utf8').match(/const CACHE = '([^']+)'/)[1];const ctx={URL,self:{location:{origin:'https://example.test'},registration:{scope:'https://example.test/Flagship-Solar/'},clients:{claim:async()=>{}},addEventListener:(n,f)=>handlers[n]=f},caches:{keys:async()=>['other-product','flagship-v84','flagship-completion-v87','flagship-completion-v88',active],delete:async k=>removed.push(k),match:async()=>({offline:true}),open:async()=>({put:async(...x)=>cached.push(x)})},fetch:async()=>({ok:false,status:503})};vm.runInNewContext(fs.readFileSync('sw.js','utf8'),ctx);return {handlers,removed,cached};}
test('PWA leaves external, auth and unrelated requests to network',()=>{const w=worker();for(const url of ['https://api.example.test/x','https://example.test/Flagship-Solar/?action=me','https://example.test/other-app/'])w.handlers.fetch({request:{url,method:'GET'},respondWith(){assert.fail('intercepted '+url);}});});
test('PWA activation preserves unrelated caches',async()=>{const w=worker();let p;w.handlers.activate({waitUntil:x=>p=x});await p;assert.deepEqual(w.removed,['flagship-v84','flagship-completion-v87','flagship-completion-v88']);});
test('PWA failed navigation uses cache without overwriting it',async()=>{const w=worker();let p;w.handlers.fetch({request:{url:'https://example.test/Flagship-Solar/index.html',method:'GET',mode:'navigate'},respondWith:x=>p=x});assert.deepEqual(await p,{offline:true});assert.equal(w.cached.length,0);});
test('all PWA shell files exist',()=>{const shell=vm.runInNewContext(fs.readFileSync('sw.js','utf8').match(/const SHELL = (\[[\s\S]*?\]);/)[1]);for(const f of shell)assert.ok(fs.existsSync(f==='./'?'index.html':f),f);});
function adapter(rows){let posted;const ctx={window:{FLAGSHIP_SUPABASE_CONFIG:{url:'https://test.supabase.co',anonKey:'test-only'}},fetch:async(url,options)=>{posted={url,options};return {ok:true,status:200,json:async()=>rows};}};vm.runInNewContext(fs.readFileSync('supabase-client.js','utf8'),ctx);return {api:ctx.window.FlagshipSupabase,get posted(){return posted;}};}
test('Supabase requires exact returned card and correct projection',async()=>{const row={id:'remote',client_id:'card',data:{id:'card',updated:123},status:'DRAFT'};const a=adapter([row]);await a.api.restore({access_token:'test',user:{id:'test-user'}});const saved=await a.api.saveJobCard({id:'card'});assert.match(a.posted.url,/select=\*/);assert.equal(saved.updated,123);assert.equal(saved.remote_id,'remote');assert.equal(row.data.remote_id,undefined);});
test('Supabase missing or mismatched acknowledgement rejects',async()=>{for(const rows of [[],[{client_id:'wrong',data:{}}]]){const a=adapter(rows);await a.api.restore({access_token:'test',user:{id:'test-user'}});await assert.rejects(a.api.saveJobCard({id:'card'}),/acknowledgement/);}});
test('publishable API key is not sent as bearer; signed-in JWT still is',async()=>{
 const requests=[],ctx={window:{FLAGSHIP_SUPABASE_CONFIG:{url:'https://test.supabase.co',anonKey:'sb_publishable_testonly'}},fetch:async(url,options)=>{requests.push(options.headers);return {ok:true,status:200,json:async()=>url.endsWith('/user')?{id:'u'}:[]};}};
 vm.runInNewContext(fs.readFileSync('supabase-client.js','utf8'),ctx);
 await ctx.window.FlagshipSupabase.listPrices();assert.equal(requests[0].apikey,'sb_publishable_testonly');assert.equal(requests[0].Authorization,undefined);
 await ctx.window.FlagshipSupabase.restore({access_token:'user-jwt',user:{id:'u'}});assert.equal(requests[1].Authorization,'Bearer user-jwt');
});

test('Supabase price rows map to the legacy price shape',async()=>{
 const a=adapter([{id:'p1',company_id:'c1',category:'Solar',supplier:'S',code:'SKU',description:'Panel',description_en:'Panel EN',unit:'each',price_type:'Sell',cost:'100.50',markup:'20',install:'5',spec:'Spec',active:true}]);
 const rows=await a.api.listPrices();
 assert.equal(rows[0].type,'Sell');assert.equal(rows[0].cost,100.5);assert.equal(rows[0].markup,20);assert.equal(rows[0].install,5);assert.equal(rows[0].descriptionEn,'Panel EN');
});
test('Supabase photo uploads are scoped to the signed-in user folder',async()=>{
 let uploaded;const ctx={window:{FLAGSHIP_SUPABASE_CONFIG:{url:'https://test.supabase.co',anonKey:'sb_publishable_testonly'}},fetch:async(url,options)=>{
   if(url.endsWith('/auth/v1/user'))return {ok:true,status:200,json:async()=>({id:'user-1'})};
   if(url.includes('/profiles?'))return {ok:true,status:200,json:async()=>[]};
   uploaded={url,options};return {ok:true,status:200,json:async()=>({})};
 }};
 vm.runInNewContext(fs.readFileSync('supabase-client.js','utf8'),ctx);
 await ctx.window.FlagshipSupabase.restore({access_token:'jwt',user:{id:'user-1'}});
 await ctx.window.FlagshipSupabase.uploadJobCardPhoto('card-1','blob','image/jpeg');
 assert.match(uploaded.url,/job-card-photos\/user-1\/job-cards\/card-1\//);
});
