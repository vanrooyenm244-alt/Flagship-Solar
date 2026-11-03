/** Keep album photos separate when TimeTree has not linked them to an event. */
function ttBackupAlbumUrl_(url,calendarId){
  return typeof url==='string'&&new RegExp('^https://album-attachment\\.timetreeapp\\.com/images/calendars/'+calendarId+'/[0-9]+/[A-Za-z0-9_.-]+(?:\\?[^#]*)?$').test(url);
}
function ttBackupAlbum_(deadline){
  var p=PropertiesService.getScriptProperties(),queueId=p.getProperty('TT_BACKUP_ALBUM_QUEUE_FILE_ID');
  if(!queueId)return {configured:false};
  if(p.getProperty('TT_BACKUP_ALBUM_COMPLETED_QUEUE')===queueId)return {complete:true,total:Number(p.getProperty('TT_BACKUP_ALBUM_TOTAL')||0),downloadedThisRun:0};
  var queue=JSON.parse(DriveApp.getFileById(queueId).getBlob().getDataAsString());
  var allowed=(p.getProperty('TIMETREE_ALLOWED_CALENDAR_IDS')||'63108444,96534365').split(',').map(function(x){return x.trim();});
  if(queue.version!==1||!/^\d+$/.test(String(queue.calendarId))||allowed.indexOf(String(queue.calendarId))<0||!Array.isArray(queue.photos))throw Error('Album export has an unapproved calendar or invalid schema');
  var folder=ttBackupFolder_('Calendar album'),row=Math.max(0,Number(p.getProperty('TT_BACKUP_ALBUM_ROW')||0)),downloaded=0,reused=0;
  if(!isFinite(row)||Math.floor(row)!==row||row>queue.photos.length)throw Error('Invalid album backup position; no files changed');
  p.setProperty('TT_BACKUP_ALBUM_TOTAL',String(queue.photos.length));
  while(row<queue.photos.length&&Date.now()<deadline){
    var photo=queue.photos[row],url=photo&&photo.url;
    if(!ttBackupAlbumUrl_(url,String(queue.calendarId)))throw Error('Unapproved album image URL; backup position retained');
    var name='album-'+ttDigest_(url.split('?')[0]),files=folder.getFilesByName(name);
    if(files.hasNext())reused++;
    else{
      var response=UrlFetchApp.fetch(url,{headers:{},followRedirects:false,muteHttpExceptions:true});
      if(response.getResponseCode()!==200)throw Error('Album image HTTP '+response.getResponseCode()+'; refresh the signed album export if links expired. Backup position retained');
      var blob=response.getBlob();if(!/^image\//i.test(String(blob.getContentType()||'')))throw Error('Album response is not an image; backup position retained');
      folder.createFile(blob.setName(name)).setDescription('TimeTree calendar '+queue.calendarId+' album; '+String(photo.sourceMonth||''));downloaded++;
    }
    row++;p.setProperty('TT_BACKUP_ALBUM_ROW',String(row));
  }
  var complete=row===queue.photos.length;
  if(complete){p.setProperty('TT_BACKUP_ALBUM_COMPLETED_AT',new Date().toISOString());p.setProperty('TT_BACKUP_ALBUM_COMPLETED_QUEUE',queueId);}
  return {complete:complete,archived:row,total:queue.photos.length,downloadedThisRun:downloaded,reusedThisRun:reused};
}
function ttBackupAlbumBatch_(deadline){
  // Keep the stock/timesheet write lock free while images download.
  var p=PropertiesService.getScriptProperties(),lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {busy:true};
  var token=Utilities.getUuid();
  try{
    if(Number(p.getProperty('TT_BACKUP_ALBUM_LEASE_UNTIL')||0)>Date.now())return {busy:true};
    p.setProperty('TT_BACKUP_ALBUM_LEASE',token);p.setProperty('TT_BACKUP_ALBUM_LEASE_UNTIL',String(deadline+60000));
  }finally{lock.releaseLock();}
  try{return ttBackupAlbum_(deadline);}
  finally{
    lock.waitLock(5000);try{if(p.getProperty('TT_BACKUP_ALBUM_LEASE')===token){p.deleteProperty('TT_BACKUP_ALBUM_LEASE');p.deleteProperty('TT_BACKUP_ALBUM_LEASE_UNTIL');}}finally{lock.releaseLock();}
  }
}
function timeTreeBackupAlbumNow(){
  var result=ttBackupAlbumBatch_(Date.now()+200000);console.log(JSON.stringify(result));return result;
}
