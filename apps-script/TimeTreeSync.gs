/** Native Google timer: no separate hosting or credentials in the phone apps.
 * Script properties: TIMETREE_EMAIL, TIMETREE_PASSWORD, optional TIMETREE_ROUTES_JSON.
 * Enable only after reviewing calendar routing. Existing triggers are never removed.
 */
function ttFetch_(path,cookie,payload){
  var options={method:payload?'put':'get',contentType:'application/json',headers:{'X-Timetreea':'web/2.1.0/en'},muteHttpExceptions:true,followRedirects:false};
  if(cookie)options.headers.Cookie=cookie;if(payload)options.payload=JSON.stringify(payload);
  var r=UrlFetchApp.fetch('https://timetreeapp.com/api/v1'+path,options);
  if(r.getResponseCode()!==200)throw Error('TimeTree HTTP '+r.getResponseCode()+'; previous bookings retained');
  return {json:JSON.parse(r.getContentText()),headers:r.getAllHeaders()};
}
function ttCookie_(headers){var values=[];Object.keys(headers).forEach(function(k){if(k.toLowerCase()==='set-cookie')values=values.concat(headers[k]);});return values.map(function(c){return String(c).split(';')[0];}).join('; ');}
function ttSourcePages_(calendarId,cookie,deadline){var pages=[],cursor=null,seen={};for(var n=0;n<1000;n++){
  if(Date.now()>deadline)throw Error('TimeTree read exceeded safe run time; no bookings imported');
  var j=ttFetch_('/calendar/'+calendarId+'/events/sync'+(cursor===null?'':'?since='+encodeURIComponent(cursor)),cookie).json;
  if(!Array.isArray(j.events)||typeof j.chunk!=='boolean')throw Error('Unexpected TimeTree source response');pages.push(j);
  if(!j.chunk)return pages;if(j.since===undefined||seen[String(j.since)])throw Error('TimeTree cursor did not advance');seen[String(j.since)]=true;cursor=j.since;Utilities.sleep(350);
}throw Error('TimeTree pagination limit reached');}
function ttNormalizeSource_(raw,m,targets){
  if(!raw.uuid||typeof raw.start_at!=='number'||typeof raw.end_at!=='number')throw Error('TimeTree booking missing identity or dates');
  var tz=raw.all_day?'UTC':raw.start_timezone||'Africa/Johannesburg',etz=raw.all_day?'UTC':raw.end_timezone||tz,start=new Date(raw.start_at),end=new Date(raw.end_at);
  var names=(raw.attendees||[]).map(function(id){var u=(m.calendar_users||[]).filter(function(u){return String(u.id)===String(id);})[0];return u?u.name:'TimeTree member '+id;}),label=(m.calendar_labels||[]).filter(function(x){return String(x.id)===String(raw.label_id);})[0];
  return {id:'tt:'+m.id+':'+raw.uuid,source:'timetree',sourceCalendarId:String(m.id),sourceEventId:String(raw.uuid),calendarName:m.name,targets:targets,customer:raw.title||'(Untitled booking)',site:raw.location||'',date:Utilities.formatDate(start,tz,'yyyy-MM-dd'),endDate:Utilities.formatDate(end,etz,'yyyy-MM-dd'),startTime:raw.all_day?'':Utilities.formatDate(start,tz,'HH:mm'),endTime:raw.all_day?'':Utilities.formatDate(end,etz,'HH:mm'),startAt:raw.start_at,endAt:raw.end_at,allDay:!!raw.all_day,timeZone:raw.start_timezone||'Africa/Johannesburg',technician:names.join(', '),jobType:label?label.name||'':'',notes:raw.note||'',status:raw.deactivated_at?'ARCHIVED':'SCHEDULED',recurrences:raw.recurrences||[],recurringUuid:raw.recurring_uuid||'',sourceUrl:'https://timetreeapp.com/calendars/'+m.alias_code+'/events/'+raw.uuid,sourceUpdatedAt:Number(raw.updated_at)||0,raw:raw};
}
function timeTreeSyncScheduled(){
  var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {ok:false,busy:true};
  var props=PropertiesService.getScriptProperties(),deadline=Date.now()+240000,run=Utilities.getUuid();
  try{
    var email=props.getProperty('TIMETREE_EMAIL'),password=props.getProperty('TIMETREE_PASSWORD');if(!email||!password)throw Error('Configure TimeTree credentials in Script Properties');
    var login=ttFetch_('/auth/email/signin','',{uid:email,password:password,uuid:Utilities.getUuid().replace(/-/g,'')}),cookie=ttCookie_(login.headers);if(!cookie)throw Error('TimeTree did not issue a session');
    var calendars=ttFetch_('/calendars?since=0',cookie).json.calendars;if(!Array.isArray(calendars))throw Error('Unexpected calendar response');
    var allowed=(props.getProperty('TIMETREE_ALLOWED_CALENDAR_IDS')||'63108444,96534365').split(',').map(function(x){return x.trim();}),routes=JSON.parse(props.getProperty('TIMETREE_ROUTES_JSON')||'{}'),events=[],archiveRows=[],digests={};
    allowed.forEach(function(id){var m=calendars.filter(function(x){return String(x.id)===id;})[0];if(!m)throw Error('Approved calendar unavailable: '+id);var pages=ttSourcePages_(id,cookie,deadline),source=JSON.stringify({metadata:m,pages:pages});
      var digest=ttDigest_(source);digests[id]=digest;
      if(props.getProperty('TIMETREE_SOURCE_DIGEST_'+id)!==digest)for(var offset=0,part=0;offset<source.length;offset+=40000,part++)archiveRows.push([new Date(),run,id,part,"'"+source.slice(offset,offset+40000),digest]);
      var byId={};pages.forEach(function(p){p.events.forEach(function(raw){var old=byId[raw.uuid];if(!old||Number(raw.updated_at)>=Number(old.updated_at))byId[raw.uuid]=raw;});});
      Object.keys(byId).forEach(function(k){events.push(ttNormalizeSource_(byId[k],m,routes[m.name]||['Flagship Solar','Hi Service']));});
    });
    if(Date.now()>deadline)throw Error('Read exceeded safe run time; no import performed');
    // Store every source page before changing the mirror. Never overwrite past archives.
    ttAppendRows_(ttSheet_('TimeTreeSourceArchive',['Captured at','Run ID','Calendar ID','Part','Source JSON chunk','Full source digest']),archiveRows);
    Object.keys(digests).forEach(function(id){props.setProperty('TIMETREE_SOURCE_DIGEST_'+id,digests[id]);});
    var result=timeTreeApply_(events,run);props.setProperty('TIMETREE_LAST_RUN_STATUS','OK: '+events.length+' records; '+result.changed+' changed');return result;
  }catch(e){props.setProperty('TIMETREE_LAST_RUN_STATUS','ERROR: '+String(e.message||e));throw e;}
  finally{lock.releaseLock();}
}
function installTimeTreeSync(){
  var existing=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='timeTreeSyncScheduled';});
  if(!existing.length)ScriptApp.newTrigger('timeTreeSyncScheduled').timeBased().everyMinutes(15).create();
  return 'TimeTree sync trigger ready (every 15 minutes). Run timeTreeSyncScheduled once and inspect the result.';
}
