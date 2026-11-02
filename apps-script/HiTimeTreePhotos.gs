/**
 * Read-only, authenticated TimeTree photo import for an existing Hi Service
 * booking. Never exposes TimeTree credentials or downloads arbitrary URLs.
 * TimeTree's web interface is unofficial: unknown schemas fail closed.
 */
function hiTimeTreePhotos_(body) {
  var user=auth_(body,['Admin','Technician','Worker']);
  if(String(body.company||'')!=='Hi Service')throw Error('Hi Service company is required');
  var id=String(body.bookingId||'');
  var m=/^tt:(\d+):([A-Za-z0-9_-]+)$/.exec(id);
  if(!m)throw Error('Invalid TimeTree booking ID');
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('TimeTreeEvents');
  if(!sh||sh.getLastRow()<2)throw Error('No mirrored bookings');
  var source=null;
  sh.getRange(2,1,sh.getLastRow()-1,5).getValues().some(function(row){
    if(String(row[0])!==id)return false;
    source=JSON.parse(String(row[3]||'{}'));return true;
  });
  if(!source||String(source.sourceCalendarId)!==m[1]||
     String(source.sourceEventId)!==m[2]||
     source.status==='ARCHIVED'||
     !Array.isArray(source.targets)||source.targets.indexOf('Hi Service')<0||
     !ttTagVisible_(source,'Hi Service',user))
    throw Error('TimeTree booking is unavailable for this Hi Service user');
  var props=PropertiesService.getScriptProperties();
  var email=props.getProperty('TIMETREE_EMAIL'),password=props.getProperty('TIMETREE_PASSWORD');
  if(!email||!password)throw Error('TimeTree read credentials are not configured');
  var login=ttFetch_('/auth/email/signin','',{uid:email,password:password,uuid:Utilities.getUuid().replace(/-/g,'')});
  var cookie=ttCookie_(login.headers);
  if(!cookie)throw Error('TimeTree did not issue a session');
  var endpoint='/calendar/'+encodeURIComponent(m[1])+'/event/'+encodeURIComponent(m[2])+'/activities?since=0';
  var records=[],cursor=null,seen={};
  for(var page=0;page<5;page++){
    var response=ttFetch_(endpoint+(cursor===null?'':'&since='+encodeURIComponent(cursor)),cookie).json;
    var feed=response&&(Array.isArray(response.event_activities)?response.event_activities:response.activities);
    if(!Array.isArray(feed))throw Error('TimeTree activity response schema changed');
    records=records.concat(feed);
    if(records.length>100)throw Error('Too many TimeTree activities to import safely');
    if(response.chunk!==true)break;
    if(response.since==null||seen[String(response.since)])throw Error('TimeTree activity cursor invalid');
    seen[String(response.since)]=true;cursor=response.since;
  }
  var links=[],used={};
  function add(raw){
    if(!raw||typeof raw!=='object')return;
    var fields=[raw.image_url,raw.imageUrl,raw.photo_url,raw.photoUrl,raw.original_url,raw.originalUrl,raw.url,raw.download_url,raw.downloadUrl,raw.src];
    if(raw.image&&typeof raw.image==='object')fields.push(raw.image.url,raw.image.original_url);
    if(raw.photo&&typeof raw.photo==='object')fields.push(raw.photo.url,raw.photo.original_url);
    if(raw.attachment&&typeof raw.attachment==='object')fields.push(raw.attachment.url);
    if(raw.file&&typeof raw.file==='object')fields.push(raw.file.url);
    fields.forEach(function(v){
      if(typeof v!=='string'||!/^https:\/\//i.test(v)||used[v])return;
      // Allow only TimeTree-owned media hosts. Avoid general-purpose URL fetch.
      var host=/^https:\/\/([^\/?#]+)(?:[\/?#]|$)/i.exec(v);
      if(!host||!/^(?:[a-z0-9-]+\.)*(?:timetreeapp\.com|timetree\.com)$/i.test(host[1]))return;
      used[v]=true;links.push(v);
    });
  }
  // Some TimeTree clients attach media directly to the source event rather than activities.
  if(source.raw){add(source.raw);['attachments','images','photos','files'].forEach(function(k){if(Array.isArray(source.raw[k]))source.raw[k].forEach(add);});}
  // TimeTree activities vary between message/image shapes. Inspect bounded nested
  // attachment objects without treating arbitrary strings as download URLs.
  function scan(v,depth){
    if(depth>5||!v||typeof v!=='object')return;
    if(Array.isArray(v)){v.slice(0,30).forEach(function(child){scan(child,depth+1);});return;}
    add(v);
    Object.keys(v).slice(0,35).forEach(function(k){if(v[k]&&typeof v[k]==='object')scan(v[k],depth+1);});
  }
  scan(source.raw,0);
  records.forEach(function(a){scan(a,0);});
  records.forEach(function(a){
    add(a);
    ['attachments','images','photos','files'].forEach(function(k){
      if(Array.isArray(a[k]))a[k].forEach(add);
    });
    if(a.comment&&typeof a.comment==='object'){add(a.comment);if(Array.isArray(a.comment.images))a.comment.images.forEach(add);if(Array.isArray(a.comment.attachments))a.comment.attachments.forEach(add);}
    if(a.attachment){if(typeof a.attachment==='object')add(a.attachment);else if(typeof a.attachment==='string'){try{add(JSON.parse(a.attachment));}catch(ignore){}}}
    if(a.content&&typeof a.content==='object'){
      add(a.content);
      if(Array.isArray(a.content.attachments))a.content.attachments.forEach(add);
    }
  });
  // Cache source images in a restricted Drive folder so revisiting a job card
  // works even if TimeTree changes an attachment's temporary URL.
  var folderName='HiServiceTimeTreeJobCardPhotos',root=DriveApp.getRootFolder();
  var folders=root.getFoldersByName(folderName);
  var folder=folders.hasNext()?folders.next():root.createFolder(folderName);
  var photos=[],failures=0;
  links.slice(0,12).forEach(function(url,i){
    var hash=ttDigest_(id+'|'+url),existing=folder.getFilesByName(hash);
    var file=existing.hasNext()?existing.next():null;
    if(!file){
      try{
        var res=UrlFetchApp.fetch(url,{headers:{Cookie:cookie},followRedirects:false,muteHttpExceptions:true});
        if(res.getResponseCode()!==200){failures++;return;}
        var headers=res.getAllHeaders(),type=String(headers['Content-Type']||headers['content-type']||'').split(';')[0].trim().toLowerCase();
        if(!/^image\/(?:jpeg|png|webp)$/.test(type)){failures++;return;}
        var bytes=res.getContent();
        if(bytes.length>2000000){failures++;return;}
        file=folder.createFile(Utilities.newBlob(bytes,type,hash)).setDescription('Hi Service booking '+id);
      }catch(ignore){failures++;return;}
    }
    var bytes=file.getBlob().getBytes(),mime=String(file.getMimeType()||'').toLowerCase();
    if(bytes.length>2000000||!/^image\/(?:jpeg|png|webp)$/.test(mime)){failures++;return;}
    photos.push({id:hash,name:'TimeTree photo '+(i+1),mimeType:mime,dataUrl:'data:'+mime+';base64,'+Utilities.base64Encode(bytes)});
  });
  return {ok:true,bookingId:id,photos:photos,activityCount:records.length,discoveredUrls:links.length,downloaded:photos.length,failedDownloads:failures,
    note:links.length===0?'No supported image attachment URLs were found in TimeTree activities. Verify source format.':''};
}
