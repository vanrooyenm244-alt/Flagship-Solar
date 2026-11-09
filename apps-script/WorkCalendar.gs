/** Shared app scheduling. Independent of TimeTree availability. */
function workCalendarPermissions_(){
  if(!APP_PERMISSION_CATALOG_['Hi Service'].some(function(x){return x.key==='calendar.edit';}))
    APP_PERMISSION_CATALOG_['Hi Service'].push({key:'calendar.edit',label:'Calendar — schedule / change jobs'});
  APP_PERMISSION_ACTIONS_.hiScheduleJob='calendar.edit';
  APP_PERMISSION_ACTIONS_.scheduleJob='calendar.edit';
  APP_PERMISSION_ACTIONS_.quoteJob='calendar.edit';
  APP_PERMISSION_ACTIONS_.hiQuoteJob='calendar.edit';
  APP_PERMISSION_ACTIONS_.hiCalendarTechnicians='calendar.edit';
  APP_PERMISSION_ACTIONS_.calendarTechnicians='calendar.edit';
  APP_PERMISSION_ACTIONS_.hiCalendarNotifications='calendar.view';
  APP_PERMISSION_ACTIONS_.calendarNotifications='calendar.view';
  APP_PERMISSION_ACTIONS_.hiCalendarNotificationsAck='calendar.view';
  APP_PERMISSION_ACTIONS_.calendarNotificationsAck='calendar.view';
}
function workCalendarCompany_(body){
  var action=String(body.action||''),company=/^hi[A-Z]/.test(action)?'Hi Service':'Flagship Solar';
  if(body.company&&body.company!==company)throw Error('Calendar company mismatch');
  return company;
}
function workCalendarEligibleUsers_(){
  var sh=sheet_('Users'),n=sh.getLastRow(),users=[];
  if(n<2)return users;
  sh.getRange(2,1,n-1,4).getValues().forEach(function(r){
    var username=String(r[0]||'').trim(),name=String(r[1]||'').trim(),role=String(r[2]||'').trim(),status=String(r[3]||'').trim().toLowerCase();
    if(username&&name&&status==='active'&&['Admin','Technician','Worker'].indexOf(role)>=0)
      users.push({username:username,name:name,role:role});
  });
  return users;
}
function workCalendarTechnicians_(body){
  workCalendarPermissions_();var company=workCalendarCompany_(body),u=auth_(body,['Admin','Technician']);
  if(!permissionAllowed_(u,company,'calendar.edit'))throw Error('Calendar scheduling permission required');
  return {ok:true,technicians:workCalendarEligibleUsers_().map(function(x){return {username:x.username,name:x.name,role:x.role};})};
}
function workCalendarEvent_(input,company){
  var e=input||{},date=String(e.date||''),start=String(e.startTime||''),end=String(e.endTime||'');
  if(!/^(?:gcal:)?[a-zA-Z0-9_-]{8,150}$/.test(String(e.id||'')))throw Error('Invalid scheduling request ID');
  if(!String(e.customer||'').trim())throw Error('Customer is required');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Valid booking date required');
  [start,end].forEach(function(t){if(t&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))throw Error('Use 24-hour time HH:mm');});
  var endDate=String(e.endDate||date);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(endDate)||!isFinite(Date.parse(endDate))||new Date(endDate).toISOString().slice(0,10)!==endDate||endDate<date)throw Error('Valid end date required');
  if(end&&!start||start&&end&&endDate===date&&end<=start)throw Error('End time must be after start time');
  var recurrence=Array.isArray(e.recurrences)?e.recurrences:[];
  if(e.repeat&&e.repeat!=='none'){
    if(['DAILY','WEEKLY','MONTHLY','YEARLY'].indexOf(e.repeat)<0)throw Error('Invalid repeat interval');
    recurrence=['RRULE:FREQ='+e.repeat];
  }
  if(recurrence.length>5||recurrence.some(function(r){return typeof r!=='string'||r.length>500||!/^RRULE:|^EXDATE:|^RDATE:/.test(r);}))throw Error('Invalid repeating booking');
  var ids=Array.isArray(e.assignedUsernames)?e.assignedUsernames.map(function(x){return String(x||'').trim();}).filter(Boolean):[];
  ids=ids.filter(function(x,i){return ids.indexOf(x)===i;});
  if(!ids.length)throw Error('Select at least one technician');
  if(ids.length>15)throw Error('Select no more than 15 technicians');
  var eligible=workCalendarEligibleUsers_(),selected=ids.map(function(id){
    var found=eligible.find(function(x){return x.username.toLowerCase()===id.toLowerCase();});
    if(!found)throw Error('One selected technician is no longer active');
    return found;
  });
  var out={id:String(e.id),source:'app',company:company,date:date,endDate:endDate,startTime:start,endTime:end,allDay:e.allDay===true||e.allDay==='on'||!start,status:'SCHEDULED',timeZone:'Africa/Johannesburg',recurrences:recurrence,assignedUsernames:selected.map(function(x){return x.username;})};
  ['customer','site','jobType','notes','jobNo'].forEach(function(k){out[k]=String(e[k]||'').trim();if(out[k].length>(k==='notes'?10000:500))throw Error('Booking '+k+' is too long');});
  if(e.jobListId)out.jobListId=e.jobListId;
  out.technician=selected.map(function(x){return x.name;}).join(', ');
  return out;
}
function workCalendarNotificationSheet_(){
  return ttSheet_('CalendarNotifications',['ID','Company','Username','Type','Event ID','Title','Body','Run At','Start At','Status','Created At','Delivered At']);
}
function workCalendarQueueNotification_(sh,event,username,type,runAt,startAt){
  var title=type==='job_created'?'New job assigned':type==='reminder_30'?'Appointment in 30 minutes':'Appointment in 5 minutes';
  var when=event.startTime?event.startTime:'';
  var body=[event.customer,when,event.site,event.jobNo?'Job '+event.jobNo:''].filter(Boolean).join(' · ');
  sh.appendRow([Utilities.getUuid(),event.company,username,type,event.id,title,body,runAt,startAt,'PENDING',Date.now(),'']);
}
function workCalendarCancelPending_(sh,eventId){
  var n=sh.getLastRow();if(n<2)return;
  var rows=sh.getRange(2,1,n-1,12).getValues();
  rows.forEach(function(r,i){if(String(r[4])===String(eventId)&&String(r[9])==='PENDING')sh.getRange(i+2,10).setValue('CANCELLED');});
}
function workCalendarAppointmentStart_(event){
  if(!event.date||!event.startTime)return 0;
  try{return Utilities.parseDate(event.date+' '+event.startTime,'Africa/Johannesburg','yyyy-MM-dd HH:mm').getTime();}catch(e){return 0;}
}
function workCalendarSave_(body){
  workCalendarPermissions_();var company=workCalendarCompany_(body),u=auth_(body,['Admin','Technician']);
  if(!permissionAllowed_(u,company,'calendar.edit'))throw Error('Calendar scheduling permission required');
  var input=quoteJobBindBooking_(body.event||{},company);
  var event=workCalendarEvent_(input,company),lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    var sh=ttSheet_('ScheduledJobs',['ID','Company','Date','Start','End','Technician','Data JSON','Updated','Created By']);
    var found=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,1).createTextFinder(event.id).matchEntireCell(true).useRegularExpression(false).findNext():null;
    var row=found?found.getRow():0;
    if(row&&String(sh.getRange(row,2).getValue())!==company)throw Error('Booking belongs to another company');
    var previous=row?JSON.parse(String(sh.getRange(row,7).getValue()||'{}')):null;
    if(typeof workGoogleSave_==='function'){
      var google=workGoogleSave_(event,input);
      Object.assign(event,{source:'google',googleEventId:google.googleEventId,googleEtag:google.googleEtag,sourceUrl:google.sourceUrl,startAt:google.startAt,endAt:google.endAt});
    }
    var now=new Date();event.updatedAt=now.getTime();event.createdBy=row?String(sh.getRange(row,9).getValue()):u.username;
    var values=[event.id,company,event.date,event.startTime,event.endTime,event.technician,JSON.stringify(event),now,event.createdBy];
    if(row)sh.getRange(row,1,1,values.length).setValues([values]);else{sh.appendRow(values);row=sh.getLastRow();}
    sh.getRange(row,8).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    var ns=workCalendarNotificationSheet_();workCalendarCancelPending_(ns,event.id);
    var oldAssigned=previous&&Array.isArray(previous.assignedUsernames)?previous.assignedUsernames.map(String):[];
    var newlyAssigned=event.assignedUsernames.filter(function(id){return !oldAssigned.some(function(old){return old.toLowerCase()===id.toLowerCase();});});
    var startAt=workCalendarAppointmentStart_(event),current=Date.now();
    newlyAssigned.forEach(function(id){workCalendarQueueNotification_(ns,event,id,'job_created',current,startAt);});
    if(startAt>current){
      event.assignedUsernames.forEach(function(id){
        var r30=startAt-30*60*1000,r5=startAt-5*60*1000;
        if(r30>current)workCalendarQueueNotification_(ns,event,id,'reminder_30',r30,startAt);
        if(r5>current)workCalendarQueueNotification_(ns,event,id,'reminder_5',r5,startAt);
      });
    }
    log_(u.username,'scheduleJob',event.id,company,event.customer);
    return {ok:true,id:event.id,updatedAt:event.updatedAt,event:event};
  }finally{lock.releaseLock();}
}
function workCalendarNotifications_(body){
  workCalendarPermissions_();var company=workCalendarCompany_(body),u=auth_(body,['Admin','Technician','Worker']);
  if(!permissionAllowed_(u,company,'calendar.view'))throw Error('Calendar view permission required');
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CalendarNotifications'),items=[],now=Date.now();
  if(!sh||sh.getLastRow()<2)return {ok:true,notifications:[]};
  sh.getRange(2,1,sh.getLastRow()-1,12).getValues().forEach(function(r,i){
    if(String(r[1])!==company||String(r[2]).toLowerCase()!==u.username.toLowerCase()||String(r[9])!=='PENDING')return;
    var runAt=Number(r[7])||0,startAt=Number(r[8])||0;
    if(runAt>now)return;
    if(startAt&&now>=startAt&&String(r[3])!=='job_created'){sh.getRange(i+2,10).setValue('EXPIRED');return;}
    items.push({id:String(r[0]),type:String(r[3]),eventId:String(r[4]),title:String(r[5]),body:String(r[6]),runAt:runAt});
  });
  return {ok:true,notifications:items.slice(0,50)};
}
function workCalendarNotificationsAck_(body){
  workCalendarPermissions_();var company=workCalendarCompany_(body),u=auth_(body,['Admin','Technician','Worker']);
  if(!permissionAllowed_(u,company,'calendar.view'))throw Error('Calendar view permission required');
  var ids=Array.isArray(body.notificationIds)?body.notificationIds.map(String):[];
  if(!ids.length)return {ok:true,acknowledged:0};
  if(ids.length>100)throw Error('Too many notification IDs');
  var wanted={};ids.forEach(function(id){wanted[id]=true;});
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CalendarNotifications'),count=0;
  if(!sh||sh.getLastRow()<2)return {ok:true,acknowledged:0};
  sh.getRange(2,1,sh.getLastRow()-1,12).getValues().forEach(function(r,i){
    if(wanted[String(r[0])]&&String(r[1])===company&&String(r[2]).toLowerCase()===u.username.toLowerCase()&&String(r[9])==='PENDING'){
      sh.getRange(i+2,10,1,2).setValues([['DELIVERED',new Date()]]);count++;
    }
  });
  return {ok:true,acknowledged:count};
}
function workCalendarList_(u,company,body){
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ScheduledJobs'),events=[];
  if(!sh||sh.getLastRow()<2)return events;
  var window=body.bookingId?{bookingId:String(body.bookingId)}:ttCalendarWindow_(body);
  sh.getRange(2,1,sh.getLastRow()-1,9).getValues().forEach(function(row){
    if(row[1]!==company)return;
    if(window&&window.bookingId&&row[0]!==window.bookingId)return;
    var e=JSON.parse(row[6]);
    if(window&&!window.bookingId&&!(e.recurrences||[]).length&&((e.endDate||e.date)<window.from||e.date>window.to))return;
    if(u.role==='Worker'&&!jobCardAssigned_(e.technician,u.name))return;
    events.push(e);
  });return events;
}
function workCalendarRead_(body){
  workCalendarPermissions_();var company=workCalendarCompany_(body),u=auth_(body,['Admin','Technician','Worker']);
  if(!permissionAllowed_(u,company,'calendar.view'))throw Error('Calendar view permission required');
  if(typeof ttCalendarWindow_==='function')ttCalendarWindow_(body); // Validate caller input before the archive fallback can catch provider errors.
  var result={ok:true,events:[]};
  try{result=body.bookingId&&String(body.bookingId).indexOf('tt:')!==0?result:company==='Hi Service'?hiCalendar_(body):calendarList_(body);}
  catch(error){result.archiveWarning='TimeTree archive unavailable: '+String(error.message||error);}
  var local=workCalendarList_(u,company,body),remote=[];
  if(typeof workGoogleList_==='function'){
    try{remote=workGoogleList_(u,company,body);local=local.filter(function(e){return !e.googleEventId;});result.googleCalendar={connected:true,calendarId:WORK_GOOGLE_CALENDAR_ID_};}
    catch(error){result.googleCalendar={connected:false,error:String(error.message||error)};}
  }
  var records={};result.events.concat(local,remote).forEach(function(e){records[e.id]=e;});
  result.events=jobCompletionOverlay_(Object.keys(records).map(function(id){return records[id];}).filter(function(e){return e.status!=='ARCHIVED'||e.source==='timetree';}),company);
  result.backupStatus=PropertiesService.getScriptProperties().getProperty('TIMETREE_BACKUP_STATUS')||'Not started';
  return result;
}

function workCalendarCompletion_(body){
  var u=auth_(body,['Admin','Technician','Worker']),company=body.company==='Hi Service'?'Hi Service':'Flagship Solar';
  var date=String(body.occurrenceDate||''),id=String(body.eventId||'');
  var visible=workCalendarList_(u,company,{bookingId:id});
  if(!visible.length&&typeof workGoogleFind_==='function'){var google=workGoogleFind_(u,company,id);if(google)visible=[google];}
  if(!visible.length)return calendarCompletionSet_(body);
  if(!permissionAllowed_(u,company,'calendar.view'))throw Error('Calendar view permission required');
  if(typeof body.completed!=='boolean'||date<visible[0].date||date>(visible[0].endDate||visible[0].date))throw Error('Invalid completion date or status');
  var lock=LockService.getScriptLock();lock.waitLock(15000);
  try{var now=new Date();jobCompletionSheet_().appendRow([id,company,visible[0].jobNo,String(u.name||u.username),now,body.completed?'COMPLETED':'REOPENED','',u.username,now,date]);}
  finally{lock.releaseLock();}
  return {ok:true,eventId:id,completed:body.completed,completedBy:String(u.name||u.username)};
}

