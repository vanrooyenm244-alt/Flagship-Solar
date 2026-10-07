const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {createServer,stagingCode,STAGING_ENDPOINT,STAGING_SHEET}=require('./staging-server.cjs');
test('staging frontend isolates configuration, sources and API destinations',async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const page=await fetch(base+'/');assert.equal(page.status,200);
  const policy=page.headers.get('content-security-policy');
  assert.ok(policy.includes(STAGING_ENDPOINT));assert.ok(!policy.includes('https://script.google.com;'));
  assert.ok(!policy.includes('AKfycbxJx-ZAJdnkMhnQsf9XIUe91AX5PovdlZCjph6soiF5GDDGTXy8Q8AI0OHIY6lmZwaDAQ'));
  assert.match(await (await fetch(base+'/supabase-config.js')).text(),/FLAGSHIP_SUPABASE_CONFIG = \{\}/);
  for(const file of ['/sw.js','/timesheet-sync.js','/xero-customer.js'])assert.equal((await fetch(base+file)).status,200,file);
  for(const file of ['/.git/config','/tests/latest-results.txt','/supabase/migrations/202609080001_flagship_ops.sql'])assert.equal((await fetch(base+file)).status,404,file);
  assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
function guard(sheet=STAGING_SHEET,properties={}){
 const code=stagingCode(),start=code.indexOf('function rcStagingBoundary_(');
 const c={SpreadsheetApp:{getActiveSpreadsheet:()=>({getId:()=>sheet})},PropertiesService:{getScriptProperties:()=>({getProperties:()=>properties})}};
 vm.createContext(c);vm.runInContext(code.slice(start),c);return c.rcStagingBoundary_;
}
test('generated staging backend parses and guards both entry points',()=>{const code=stagingCode();new vm.Script(code);assert.match(code,/function doGet\(e\) \{\s*rcStagingBoundary_/);assert.match(code,/function doPost\(e\) \{[\s\S]*?rcStagingBoundary_\(stagingAction\)/);});
test('staging backend refuses production and backup Sheet identities',()=>{for(const id of ['1OtZIGMbX-mdaANNI9R8Ly9yFWlsYnME76eUCPCfD55w','16sY-6D4pqj_aXjv8zzw4nUP1IOnG5QHhYfscuG5LIBI'])assert.throws(()=>guard(id)('timesheets'),/identity mismatch/);});
test('staging backend refuses copied external credentials',()=>{for(const key of ['XERO_REFRESH_TOKEN','SUPABASE_SERVICE_ROLE_KEY'])assert.throws(()=>guard(STAGING_SHEET,{[key]:'fixture'})('me'),/credentials must be absent/);});
test('staging blocks Xero writes and connection setup but permits status',()=>{const g=guard();for(const action of ['xeroCreateQuote','xeroCreateContact','xeroStart','xeroCallback','xeroSetConfig','proposalSendToXero'])assert.throws(()=>g(action),/disabled/);g('xeroStatus');g('timesheets');g('jobCardSave');});
