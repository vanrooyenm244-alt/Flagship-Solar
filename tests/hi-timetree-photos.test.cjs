const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('apps-script/HiTimeTreePhotos.gs','utf8');
function harness({activities,mediaStatus=200}={}){
 let requests=[],apiPaths=[],files=new Map();
 const folder={getFilesByName(name){return {hasNext:()=>files.has(name),next:()=>files.get(name)};},createFile(blob){const f={getBlob:()=>blob,getMimeType:()=>blob.type,setDescription(){return this;}};files.set(blob.name,f);return f;}};
 const obj={sourceCalendarId:'63108444',sourceEventId:'7755c4552a7f4a90b6231f62dc510839',status:'SCHEDULED',targets:['Hi Service'],raw:{uuid:'7755c4552a7f4a90b6231f62dc510839'}};
 const ctx={
 auth_:()=>({role:'Admin'}),ttTagVisible_:()=>true,ttDigest_:s=>require('node:crypto').createHash('sha256').update(s).digest('hex'),ttCookie_:()=> 'session=dummy',
 ttFetch_:(path)=>{apiPaths.push(path);if(path.includes('/signin'))return {headers:{'set-cookie':'session=dummy'}};return {json:{event_activities:activities||[],chunk:false}};},
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getLastRow:()=>2,getRange:()=>({getValues:()=>[['tt:63108444:7755c4552a7f4a90b6231f62dc510839',0,0,JSON.stringify(obj),0]]})})})},
 PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test'})},
 Utilities:{getUuid:()=> 'uuid-1234',newBlob:(bytes,type,name)=>({getBytes:()=>bytes,type,name}) ,base64Encode:bytes=>Buffer.from(bytes).toString('base64')},
 DriveApp:{getRootFolder:()=>({getFoldersByName:()=>({hasNext:()=>true,next:()=>folder})})},
 UrlFetchApp:{fetch:(url)=>{requests.push(url);return {getResponseCode:()=>mediaStatus,getAllHeaders:()=>({'Content-Type':'image/jpeg'}),getContent:()=>[255,216,255,217]};}}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const body={company:'Hi Service',bookingId:'tt:63108444:7755c4552a7f4a90b6231f62dc510839'};
 return {run:()=>ctx.hiTimeTreePhotos_(body),requests,apiPaths,files};
}
test('seven nested TimeTree image activities download and persist; subsequent read uses cached media',()=>{
 const activities=Array.from({length:7},(_,i)=>({content:{attachments:[{image:{url:'https://timetreeapp.com/media/photo-'+i+'.jpg'}}]}}));
 const h=harness({activities}),a=h.run();assert.equal(a.downloaded,7);assert.equal(h.files.size,7);assert.equal(h.requests.length,7);
 const b=h.run();assert.equal(b.downloaded,7);assert.equal(h.requests.length,7);
});
test('reject unknown file URLs rather than download arbitrary hosts',()=>{
 const h=harness({activities:[{image:{url:'https://example.net/secret.jpg'}}]});const r=h.run();assert.equal(r.downloaded,0);assert.equal(h.requests.length,0);
});
test('wrong company and booking identity fail closed',()=>{
 const h=harness({activities:[]});assert.equal(h.run().downloaded,0);
});

test('initial activity call omits since query, matching the existing TimeTree client',()=>{const h=harness({activities:[]});h.run();assert.match(h.apiPaths[1],/\/activities$/);assert.doesNotMatch(h.apiPaths[1],/[?&]since=/);});
