/** Five-minute read-only TimeTree -> Drive backup. Never removes source data. */
var TT_BACKUP_FOLDER_ID_='1FUjnowziz9p_CTe_HCXYh7ky58f9ZRoM';
function ttBackupFolder_(name){
  var root=DriveApp.getFolderById(TT_BACKUP_FOLDER_ID_);
  if(!name)return root;
  var folders=root.getFoldersByName(name);return folders.hasNext()?folders.next():root.createFolder(name);
}
function ttBackupJson_(folder,name,value){
  var text=JSON.stringify(value),digest=ttDigest_(text),filename=name+'-'+digest+'.json';
  var existing=folder.getFilesByName(filename);
  return existing.hasNext()?existing.next():folder.createFile(Utilities.newBlob(text,'application/json',filename));
}
function ttBackupMirror_(deadline){
  var p=PropertiesService.getScriptProperties(),ss=SpreadsheetApp.getActiveSpreadsheet();
  var folder=ttBackupFolder_('Calendar records'),count=0;
  ['TimeTreeEvents','TimeTreeHistory','TimeTreeSourceArchive','ScheduledJobs'].forEach(function(name){
    var sh=ss.getSheetByName(name);if(!sh||sh.getLastRow()<2||Date.now()>deadline)return;
    var last=sh.getLastRow(),width=sh.getLastColumn(),key='TT_BACKUP_ROW_'+name,row=Math.max(2,Number(p.getProperty(key)||2));
    if(row>last)row=2;
    // Bounded blocks avoid the Sheets 50,000-character cell limit in backup files.
    for(var n=0;n<5&&row<=last&&Date.now()<deadline;n++){
      var size=Math.min(50,last-row+1),rows=sh.getRange(row,1,size,width).getValues();
      ttBackupJson_(folder,name+'-rows-'+row,{version:1,sheet:name,startRow:row,headers:sh.getRange(1,1,1,width).getValues()[0],rows:rows});
      row+=size;count+=size;p.setProperty(key,String(row));
    }
  });return count;
}
function ttBackupMediaLinks_(value){
  var links=[],seen={};
  function scan(v,depth){
    if(!v||typeof v!=='object'||depth>8)return;
    if(Array.isArray(v)){v.forEach(function(x){scan(x,depth+1);});return;}
    Object.keys(v).forEach(function(k){var x=v[k];
      if(typeof x==='string'&&/^(image_url|photo_url|original_url|download_url|url|src|imageUrl|photoUrl|originalUrl|downloadUrl)$/.test(k)){
        var host=/^https:\/\/([^\/?#]+)(?:[\/?#]|$)/i.exec(x);
        if(host&&/^(?:[a-z0-9-]+\.)*(?:timetreeapp\.com|timetree\.com)$/i.test(host[1])&&!seen[x]){seen[x]=true;links.push(x);}
      }else if(x&&typeof x==='object')scan(x,depth+1);
    });
  }scan(value,0);return links;
}
function ttBackupActivities_(deadline){
  var p=PropertiesService.getScriptProperties();
  if(Number(p.getProperty('TIMETREE_AUTH_RETRY_AFTER')||0)>Date.now())return {paused:true};
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('TimeTreeEvents');
  if(!sh||sh.getLastRow()<2)return {events:0};
  var last=sh.getLastRow(),row=Math.max(2,Number(p.getProperty('TT_BACKUP_ACTIVITY_ROW')||2));if(row>last)row=2;
  var folder=ttBackupFolder_('Activities and attachments'),processed=0;
  // Resume within an event as well as between events. Large albums are never marked complete early.
  while(row<=last&&Date.now()<deadline&&processed<10){
    var e=JSON.parse(sh.getRange(row,4).getValue()),key='TT_BACKUP_ACTIVITY_CURSOR',state=null;
    try{state=JSON.parse(p.getProperty(key)||'null');}catch(ignore){}
    if(!state||state.id!==e.id)state={id:e.id,cursor:null,seen:[],page:0,mediaIndex:0};
    var path='/calendar/'+encodeURIComponent(e.sourceCalendarId)+'/event/'+encodeURIComponent(e.sourceEventId)+'/activities';
    var page=ttSessionFetch_(path+(state.cursor===null?'':'?since='+encodeURIComponent(state.cursor))).json;
    var feed=Array.isArray(page.event_activities)?page.event_activities:page.activities;
    if(!Array.isArray(feed))throw Error('TimeTree activity schema changed; backup cursor retained');
    ttBackupJson_(folder,'activities-'+ttDigest_(e.id)+'-page-'+state.page,{bookingId:e.id,sourceEvent:e.raw,activities:page});
    var links=ttBackupMediaLinks_({source:e.raw,activities:feed}),cookie=ttSessionCookie_();
    for(var i=state.mediaIndex;i<links.length;i++){
      if(Date.now()>deadline){state.mediaIndex=i;p.setProperty(key,JSON.stringify(state));return {events:processed,partial:true};}
      var name='media-'+ttDigest_(links[i]),files=folder.getFilesByName(name);
      if(!files.hasNext()){
        var response=UrlFetchApp.fetch(links[i],{headers:{Cookie:cookie},followRedirects:false,muteHttpExceptions:true});
        if(response.getResponseCode()!==200)throw Error('Attachment HTTP '+response.getResponseCode()+'; backup cursor retained');
        var blob=response.getBlob(),mime=String(blob.getContentType()||'').toLowerCase();
        if(!/^(image\/|video\/|application\/pdf)/.test(mime))throw Error('Unsupported attachment type; backup cursor retained');
        folder.createFile(blob.setName(name)).setDescription('TimeTree booking '+e.id);
      }
      state.mediaIndex=i+1;p.setProperty(key,JSON.stringify(state));
    }
    if(page.chunk===true){
      if(page.since==null||state.seen.indexOf(String(page.since))>=0)throw Error('TimeTree activity cursor did not advance');
      state.seen.push(String(page.since));state.cursor=page.since;state.page++;state.mediaIndex=0;
      if(state.seen.length>300)throw Error('TimeTree activity pagination requires review');
      p.setProperty(key,JSON.stringify(state));
    }else{row++;processed++;p.setProperty('TT_BACKUP_ACTIVITY_ROW',String(row));p.deleteProperty(key);}
  }
  if(row>last)p.setProperty('TT_BACKUP_ACTIVITY_COMPLETED_AT',new Date().toISOString());
  return {events:processed,nextRow:row,totalRows:last-1};
}
function timeTreeBackupTick(){
  var p=PropertiesService.getScriptProperties(),started=Date.now(),status={at:new Date().toISOString(),fullSourceBackup:false};
  // Always preserve existing mirror data, even while TimeTree login is unavailable.
  var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {busy:true};
  try{status.rowsBackedUp=ttBackupMirror_(started+90000);}catch(err){status.driveError=String(err.message||err);}
  finally{lock.releaseLock();}
  if(!p.getProperty('TT_BACKUP_LAST_SYNC_AT')||Date.now()-Number(p.getProperty('TT_BACKUP_LAST_SYNC_AT'))>=240000){
    if(Number(p.getProperty('TIMETREE_AUTH_RETRY_AFTER')||0)>Date.now())status.sync='waiting for sign-in cooldown';
    else try{var sync=timeTreeSyncScheduled();status.sync=sync&&sync.busy?'busy':'ok';if(!sync||!sync.busy)p.setProperty('TT_BACKUP_LAST_SYNC_AT',String(Date.now()));}catch(err){status.syncError=String(err.message||err);}
  }
  lock=LockService.getScriptLock();if(lock.tryLock(1000)){
    try{status.activities=ttBackupActivities_(Math.min(started+270000,Date.now()+90000));}catch(err){status.activityError=String(err.message||err);}
    finally{lock.releaseLock();}
  }
  status.retryAfter=p.getProperty('TIMETREE_AUTH_RETRY_AFTER')||null;
  p.setProperty('TIMETREE_BACKUP_STATUS',JSON.stringify(status));console.log(JSON.stringify(status));return status;
}
function installTimeTreeFiveMinuteBackup(){
  // Remove only the superseded TimeTree timer; every unrelated trigger is preserved.
  var triggers=ScriptApp.getProjectTriggers();
  if(!triggers.some(function(t){return t.getHandlerFunction()==='timeTreeBackupTick';}))ScriptApp.newTrigger('timeTreeBackupTick').timeBased().everyMinutes(5).create();
  triggers.filter(function(t){return t.getHandlerFunction()==='timeTreeSyncScheduled';}).forEach(function(t){ScriptApp.deleteTrigger(t);});
  console.log('TimeTree backup and sync every 5 minutes. Existing data is backed up during login cooldown.');
  return {ok:true,folderUrl:'https://drive.google.com/drive/folders/'+TT_BACKUP_FOLDER_ID_,minutes:5};
}
