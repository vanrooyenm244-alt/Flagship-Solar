const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const digest=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const booking='tt:63108444:event-a';
test('TimeTree comment object keys become fixed-host image URLs without accepting URLs or traversal',()=>{
 const h=harness(),key='event_activity_image/2026-02-19/photo.jpg';
 assert.equal(h.c.ttBackupImageUrl_(key),'https://attachments.timetreeapp.com/'+key);
 assert.deepEqual(Array.from(h.c.ttBackupMediaLinks_({attachment:{images:[{object_key:key}]}})),['https://attachments.timetreeapp.com/'+key]);
 for(const key of ['https://evil.test/photo.jpg','//evil.test/../photo','a/../../b','a?token=secret','a%2f..%2fb'])assert.equal(h.c.ttBackupImageUrl_(key),'');
});
function harness(events=[]){
 const props=new Map([['TIMETREE_ALLOWED_CALENDAR_IDS','63108444']]),files=new Map(),requests=[];
 const iterator=items=>{let i=0;return {hasNext:()=>i<items.length,next:()=>items[i++]};};
 const blob=(data,mime,name)=>({getDataAsString:()=>String(data),getBytes:()=>Array.isArray(data)?data:Array.from(Buffer.from(String(data))),getContentType:()=>mime,setName(n){name=n;this.name=n;return this;},name});
 const folder={getFilesByName:n=>iterator(files.has(n)?[files.get(n)]:[]),createFile:b=>{const f={getBlob:()=>b,getMimeType:()=>b.getContentType(),getName:()=>b.name,getDescription:()=>f.description||'',setDescription(d){f.description=d;return f;},setContent(s){b=blob(s,'application/json',b.name);return f;}};files.set(b.name,f);return f;},searchFiles:()=>iterator([...files.values()])};
 const c={Date,JSON,Math,Error,Array,String,Number,encodeURIComponent,console:{log(){}},ttDigest_:digest,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getLastRow:()=>events.length+1,getRange:r=>({getValue:()=>JSON.stringify(events[r-2])})})})},
  DriveApp:{getFolderById:()=>({getFoldersByName:()=>iterator([folder])})},Utilities:{newBlob:blob,base64Encode:b=>Buffer.from(b).toString('base64')},
  ttSessionCookie_:()=>{throw Error('TimeTree sign-in unavailable');},ttSessionFetch_:path=>{requests.push(path);return {json:{event_activities:[],chunk:false}};}
 };
 vm.createContext(c);vm.runInContext(fs.readFileSync('apps-script/TimeTreeBackup.gs','utf8'),c);
 c.ttBackupFolder_=()=>folder;c.ttBackupJson_=()=>{};
 return {c,props,files,folder,requests,blob,iterator};
}
test('shared-calendar backup advances past historical records outside the new account share',()=>{
 const h=harness([{id:'tt:96534365:old',sourceCalendarId:'96534365',sourceEventId:'old',raw:{}},{id:booking,sourceCalendarId:'63108444',sourceEventId:'event-a',raw:{}}]);
 h.c.ttSessionCookie_=()=> 'test';const result=h.c.ttBackupActivities_(Date.now()+60000);
 assert.equal(result.events,1);assert.equal(result.skippedOutsideSharedCalendars,1);assert.equal(result.nextRow,4);assert.equal(h.requests.length,1);assert.match(h.requests[0],/63108444/);assert.equal(h.props.get('TT_BACKUP_ACTIVITY_ROW'),'4');
});
test('real comment-image structure downloads into Drive without sending the TimeTree session to the CDN',()=>{
 const h=harness([{id:booking,sourceCalendarId:'63108444',sourceEventId:'event-a',raw:{}}]);
 h.c.ttSessionCookie_=()=> 'private-session';h.c.ttSessionFetch_=()=>({json:{event_activities:[{type:0,attachment:{images:[{object_key:'event_activity_image_o/2026/photo.jpg'}]}}],chunk:false}});
 const calls=[];h.c.UrlFetchApp={fetch:(url,opts)=>{calls.push({url,opts});return {getResponseCode:()=>200,getBlob:()=>h.blob([255,216,255,217],'image/jpeg','')};}};
 h.c.ttBackupActivities_(Date.now()+60000);assert.equal(calls.length,1);assert.equal(calls[0].opts.headers.Cookie,undefined);assert.equal(calls[0].opts.followRedirects,false);assert.equal(h.c.ttBackupCachedPhotos_(booking).downloaded,1);
});
test('one archived media file can serve two bookings without TimeTree or duplicate downloads',()=>{
 const h=harness(),name='media-'+digest('same-url');h.folder.createFile(h.blob([255,216,255,217],'image/jpeg',name)).setDescription('TimeTree booking '+booking);
 h.c.ttBackupRecordMedia_(h.folder,booking,[name],true);h.c.ttBackupRecordMedia_(h.folder,'tt:63108444:event-b',[name],true);
 for(const id of [booking,'tt:63108444:event-b']){const r=h.c.ttBackupCachedPhotos_(id);assert.equal(r.downloaded,1);assert.equal(r.archiveComplete,true);assert.equal(r.cached,true);}
 assert.equal(h.files.size,3);assert.equal(h.requests.length,0);
});
test('partial-page media manifests remain partial and a later page retains every media reference',()=>{
 const h=harness(),names=['media-'+digest('a'),'media-'+digest('b')];for(const n of names)h.folder.createFile(h.blob([1],'image/png',n));
 h.c.ttBackupRecordMedia_(h.folder,booking,[names[0]],false);assert.equal(h.c.ttBackupCachedPhotos_(booking).archiveComplete,false);
 h.c.ttBackupRecordMedia_(h.folder,booking,[names[0],names[1]],true);const r=h.c.ttBackupCachedPhotos_(booking);assert.equal(r.downloaded,2);assert.equal(r.archiveComplete,true);
});
test('legacy description recovery requires an exact booking identity and does not expose another booking',()=>{
 const h=harness();h.folder.createFile(h.blob([1],'image/png','media-'+digest('other'))).setDescription('TimeTree booking '+booking+'-other');
 assert.equal(h.c.ttBackupCachedPhotos_(booking),null);
 h.folder.createFile(h.blob([2],'image/webp','media-'+digest('own'))).setDescription('TimeTree booking '+booking);assert.equal(h.c.ttBackupCachedPhotos_(booking).downloaded,1);
});
test('an incomplete empty or damaged manifest never claims that the photo archive is complete',()=>{
 const h=harness();h.c.ttBackupRecordMedia_(h.folder,booking,[],false);assert.equal(h.c.ttBackupCachedPhotos_(booking),null);
 h.c.ttBackupRecordMedia_(h.folder,booking,[],true);assert.equal(h.c.ttBackupCachedPhotos_(booking).downloaded,0);
 h.c.ttBackupRecordMedia_(h.folder,booking,['media-'+digest('missing')],true);assert.equal(h.c.ttBackupCachedPhotos_(booking),null);
});
test('job-card photo access checks booking permissions before reading the Drive archive; refresh explicitly contacts TimeTree',()=>{
 const h=harness();let archiveReads=0;h.c.auth_=()=>({role:'Admin'});h.c.ttTagVisible_=()=>true;
 const source={sourceCalendarId:'63108444',sourceEventId:'event-a',status:'SCHEDULED',targets:['Hi Service']};
 h.c.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:()=>({getLastRow:()=>2,getRange:()=>({getValue:()=>JSON.stringify(source),createTextFinder:()=>({matchEntireCell(){return this;},useRegularExpression(){return this;},findNext:()=>({getRow:()=>2})})})})})};
 vm.runInContext(fs.readFileSync('apps-script/HiTimeTreePhotos.gs','utf8'),h.c);h.c.hiTimeTreePhotoFolder_=()=>null;h.c.ttBackupCachedPhotos_=()=>{archiveReads++;return {ok:true,cached:true,photos:[{}]};};
 const body={company:'Hi Service',bookingId:booking};assert.equal(h.c.hiTimeTreePhotos_(body).cached,true);assert.equal(archiveReads,1);
 h.c.ttTagVisible_=()=>false;assert.throws(()=>h.c.hiTimeTreePhotos_(body),/unavailable/);assert.equal(archiveReads,1);
 h.c.ttTagVisible_=()=>true;assert.throws(()=>h.c.hiTimeTreePhotos_({...body,refresh:true}),/sign-in unavailable/);assert.equal(archiveReads,1);
});
