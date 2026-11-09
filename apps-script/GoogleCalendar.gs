/** Shared scheduling store. Calendar credentials never leave Apps Script. */
var WORK_GOOGLE_CALENDAR_ID_='mjflagship@gmail.com';
function setupGoogleCalendar(){
  var calendar=CalendarApp.getCalendarById(WORK_GOOGLE_CALENDAR_ID_);
  if(!calendar)throw Error('This script account cannot access mjflagship@gmail.com Calendar.');
  var result=workGoogleRequest_('get','',null,null);
  Logger.log('Google Calendar connected: '+result.id+' ('+result.summary+')');
  return {ok:true,calendarId:result.id,name:result.summary};
}
function workGoogleRequest_(method,path,data,etag){
  var options={method:method,headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true};
  if(data){options.contentType='application/json';options.payload=JSON.stringify(data);}
  if(etag)options.headers['If-Match']=etag;
  var response=UrlFetchApp.fetch('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(WORK_GOOGLE_CALENDAR_ID_)+path,options);
  var code=response.getResponseCode(),text=response.getContentText(),body=text?JSON.parse(text):{};
  if(code>=200&&code<300)return body;
  var error=Error(code===412?'This booking changed in Google Calendar. Refresh before editing.':code===401||code===403?'Google Calendar access needs authorisation. Run setupGoogleCalendar in the Apps Script editor as mjflagship@gmail.com.':('Google Calendar request failed ('+code+'). '+(body.error&&body.error.message||'')));
  error.googleCode=code;throw error;
}
function workGoogleId_(company,id){
  return 'fs'+Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,company+'|'+id,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
}
function workGoogleNextDay_(date){return new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);}
function workGoogleCompany_(event){
  var meta=event.extendedProperties&&event.extendedProperties.private||{};
  if(meta.company==='Hi Service'||meta.company==='Flagship Solar')return meta.company;
  return /^\[Hi Service\]/i.test(event.summary||'')?'Hi Service':/^\[Flagship(?: Solar)?\]/i.test(event.summary||'')?'Flagship Solar':'';
}
function workGoogleFrom_(event){
  var meta=event.extendedProperties&&event.extendedProperties.private||{},allDay=!!(event.start&&event.start.date);
  var start=event.start||{},end=event.end||{};
  function date(value){return value?Utilities.formatDate(new Date(value),'Africa/Johannesburg','yyyy-MM-dd'):'';}
  function time(value){return value?Utilities.formatDate(new Date(value),'Africa/Johannesburg','HH:mm'):'';}
  var instance=!!event.recurringEventId;
  var out={id:instance?'gcal:'+event.id:meta.appId||'gcal:'+event.id,source:'google',company:workGoogleCompany_(event),googleEventId:event.id,googleEtag:event.etag||'',seriesAppId:meta.appId||'',
    customer:String(event.summary||'').replace(/^\[(?:Hi Service|Flagship(?: Solar)?)\]\s*/i,''),site:event.location||'',notes:event.description||'',
    date:allDay?start.date:date(start.dateTime),endDate:allDay&&end.date?new Date(Date.parse(end.date+'T00:00:00Z')-86400000).toISOString().slice(0,10):date(end.dateTime),
    startTime:allDay?'':time(start.dateTime),endTime:allDay?'':time(end.dateTime),startAt:Date.parse(start.dateTime||start.date||''),endAt:Date.parse(end.dateTime||end.date||'')-(allDay?1:0),
    allDay:allDay,timeZone:'Africa/Johannesburg',recurrences:event.recurrence||[],technician:meta.technician||'',assignedUsernames:[],jobType:meta.jobType||'',jobNo:meta.jobNo||'',jobListId:meta.jobListId||'',
    status:event.status==='cancelled'?'ARCHIVED':'SCHEDULED',sourceUrl:event.htmlLink||'',updatedAt:Date.parse(event.updated)||0};
  try{out.assignedUsernames=JSON.parse(meta.assignedUsernames||'[]');}catch(ignore){}
  return out;
}
function workGoogleResource_(event){
  var endDate=event.endDate||event.date,allDay=event.allDay===true||!event.startTime;
  var body={summary:'['+event.company+'] '+event.customer,location:event.site,description:event.notes,
    start:allDay?{date:event.date}:{dateTime:event.date+'T'+event.startTime+':00+02:00',timeZone:'Africa/Johannesburg'},
    end:allDay?{date:workGoogleNextDay_(endDate)}:{dateTime:endDate+'T'+event.endTime+':00+02:00',timeZone:'Africa/Johannesburg'},
    recurrence:event.recurrences||[],reminders:{useDefault:false,overrides:[{method:'popup',minutes:30},{method:'popup',minutes:5}]},
    extendedProperties:{private:{appId:event.id,company:event.company,assignedUsernames:JSON.stringify(event.assignedUsernames),technician:event.technician,jobType:event.jobType,jobNo:event.jobNo,jobListId:event.jobListId||''}}};
  if(!allDay&&!event.endTime)throw Error('An end time is required for a timed booking.');
  var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(body),Utilities.Charset.UTF_8);
  body.extendedProperties.private.requestHash=bytes.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
  return body;
}
function workGoogleSave_(event,input){
  var id=input.googleEventId||workGoogleId_(event.company,event.id),existing=null;
  if(!/^[a-v0-9_]+$/.test(id))throw Error('Invalid Google event ID');
  try{existing=workGoogleRequest_('get','/events/'+encodeURIComponent(id));}catch(error){if(error.googleCode!==404)throw error;}
  var resource=workGoogleResource_(event);
  if(existing){
    var meta=existing.extendedProperties&&existing.extendedProperties.private||{};
    if(workGoogleCompany_(existing)!==event.company||meta.appId!==event.id&&event.id!=='gcal:'+id)throw Error('Booking belongs to another company or job.');
    if(existing.status==='cancelled')throw Error('This booking was cancelled in Google Calendar. Create a new booking.');
    if(!input.googleEtag){
      if(meta.requestHash===resource.extendedProperties.private.requestHash)return workGoogleFrom_(existing);
      throw Error('This booking already exists. Refresh and edit the existing booking.');
    }
    // Preserve metadata not owned by this application, including other integrations.
    resource.extendedProperties.private=Object.assign({},meta,resource.extendedProperties.private);
    return workGoogleFrom_(workGoogleRequest_('patch','/events/'+encodeURIComponent(id)+'?sendUpdates=none',resource,input.googleEtag));
  }
  if(input.googleEventId||input.googleEtag)throw Error('This booking no longer exists. Refresh before editing.');
  resource.id=id;
  try{return workGoogleFrom_(workGoogleRequest_('post','/events?sendUpdates=none',resource));}
  catch(error){
    if(error.googleCode!==409)throw error;
    var retry=workGoogleRequest_('get','/events/'+encodeURIComponent(id)),m=retry.extendedProperties&&retry.extendedProperties.private||{};
    if(m.company!==event.company||m.appId!==event.id||m.requestHash!==resource.extendedProperties.private.requestHash)throw Error('Booking ID conflict. Refresh before saving.');
    return workGoogleFrom_(retry);
  }
}
function workGoogleList_(u,company,body){
  if(body.bookingId){var found=workGoogleFind_(u,company,body.bookingId);return found?[found]:[];}
  var query=['maxResults=500','showDeleted=true'],window=ttCalendarWindow_(body);
  if(window&&!body.bookingId){query.push('singleEvents=true','timeMin='+encodeURIComponent(window.from+'T00:00:00+02:00'),'timeMax='+encodeURIComponent(workGoogleNextDay_(window.to)+'T00:00:00+02:00'));}
  var events=[],token='',pages=0;
  do{
    var page=workGoogleRequest_('get','/events?'+query.join('&')+(token?'&pageToken='+encodeURIComponent(token):''));
    (page.items||[]).forEach(function(item){
      if(workGoogleCompany_(item)!==company)return;
      var event=workGoogleFrom_(item);
      if(body.bookingId&&event.id!==body.bookingId)return;
      if(u.role==='Worker'&&event.assignedUsernames.indexOf(u.username)<0&&!jobCardAssigned_(event.technician,u.name))return;
      events.push(event);
    });token=page.nextPageToken||'';pages++;
    if(token&&pages>=40)throw Error('Calendar response is incomplete. Narrow the date range.');
  }while(token);
  return events;
}
function workGoogleFind_(u,company,id){
  var googleId=String(id).indexOf('gcal:')===0?String(id).slice(5):workGoogleId_(company,id);
  if(!/^[a-v0-9_]+$/.test(googleId))return null;
  var item;try{item=workGoogleRequest_('get','/events/'+encodeURIComponent(googleId));}catch(error){if(error.googleCode===404)return null;throw error;}
  if(workGoogleCompany_(item)!==company||item.status==='cancelled')return null;
  var event=workGoogleFrom_(item);
  if(u.role==='Worker'&&event.assignedUsernames.indexOf(u.username)<0&&!jobCardAssigned_(event.technician,u.name))return null;
  return event;
}
function workGoogleStatus_(body){
  var u=auth_(body,['Admin','Technician','Worker']),company=body.company==='Hi Service'?'Hi Service':'Flagship Solar';
  if(!permissionAllowed_(u,company,'calendar.view'))throw Error('Calendar permission required');
  var calendar=workGoogleRequest_('get','');return {ok:true,calendarId:calendar.id,name:calendar.summary};
}
function workGoogleCancel_(body){
  var company=workCalendarCompany_(body),u=auth_(body,['Admin','Technician']);
  if(!permissionAllowed_(u,company,'calendar.edit'))throw Error('Calendar scheduling permission required');
  var id=String(body.googleEventId||'');if(!/^[a-v0-9_]+$/.test(id)||!body.googleEtag)throw Error('Refresh the booking before cancelling it.');
  var event=workGoogleRequest_('get','/events/'+encodeURIComponent(id));
  if(workGoogleCompany_(event)!==company)throw Error('Booking belongs to another company.');
  var cancelled=workGoogleRequest_('patch','/events/'+encodeURIComponent(id)+'?sendUpdates=none',{status:'cancelled'},body.googleEtag);
  log_(u.username,'calendarCancel',id,company,'Google Calendar');return {ok:true,id:body.eventId,googleEventId:id};
}
