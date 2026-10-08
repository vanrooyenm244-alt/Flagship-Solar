const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
test('calendar release bypasses an older phone cache and includes matching offline assets',()=>{
 const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
 const staleCache=new Map([['timetree-calendar.js','globalThis.TimeTreeCalendar={};'],['calendar-ui.css','/* previous release */'],['calendar.js','/* previous release */']]);
 const sources=['timetree-calendar.js','calendar-ui.css'];if(fs.existsSync('calendar.js'))sources.push('calendar.js');
 for(const source of sources){
  const bytes=fs.readFileSync(source),hash=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,12),deployed=source.replace(/\.(js|css)$/,'.'+hash+'.$1');
  assert.ok(html.includes('"'+deployed+'"'),source+' must load its content-specific release');
  assert.ok(sw.includes('./'+deployed),deployed+' must work offline');
  assert.deepEqual(fs.readFileSync(deployed),bytes,'Release must match tested source');
  const served=staleCache.get(deployed)||fs.readFileSync(deployed,'utf8');
  if(source==='timetree-calendar.js'){
   const browser={};vm.createContext(browser);vm.runInContext(served,browser);
   assert.equal(typeof browser.TimeTreeCalendar.visible,'function');assert.equal(typeof browser.TimeTreeCalendar.layout,'function');
   assert.equal(browser.TimeTreeCalendar.visible({source:'timetree',jobType:'Flagship Electric '},'Flagship Solar',{role:'Admin'}),true);
   assert.equal(browser.TimeTreeCalendar.visible({source:'timetree',jobType:'Andre'},'Flagship Solar',{role:'Admin'}),false);
  }
 }
});
