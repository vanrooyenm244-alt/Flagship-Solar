/** Shared app scheduling. Independent of TimeTree availability. */
function workCalendarPermissions_(){
  if(!APP_PERMISSION_CATALOG_['Hi Service'].some(function(x){return x.key==='calendar.edit';}))
    APP_PERMISSION_CATALOG_['Hi Service'].push({key:'calendar.edit',label:'Calendar — schedule / change jobs'});
  APP_PERMISSION_ACTIONS_.hiScheduleJob='calendar.edit';
  APP_PERMISSION_ACTIONS_.scheduleJob='calendar.edit';
}
function workCalendarCompany_(body){
  var company=body.action==='hiScheduleJob'||body.action==='hiCalendar'?'Hi Service':'Flagship Solar';
  if(body.company&&body.company!==company)throw Error('Calendar company mismatch');
  return company;
}
function workCalendarEvent_(input,company){
  var e=input||{},date=String(e.date||''),start=String(e.startTime||''),end=String(e.endTime||'');
  if(!/^[a-zA-Z0-9_-]{8,100}$/.test(String(e.id||'')))throw Error('Invalid scheduling request ID');
  if(!String(e.customer||'').trim())throw Error('Customer is required');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Valid booking date required');
  [start,end].forEach(function(t){if(t&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))throw Error('Use 24-hour time HH:mm');});
  if(end&&!start||start&&end&&end<=start)throw Error('End time must be after start time');
  var out={id:String(e.id),source:'app',company:company,date:date,endDate:date,startTime:start,endTime:end,status:'SCHEDULED',timeZone:'Africa/Johannesburg',recurrences:[]};
  ['customer','site','technician','jobType','notes','jobNo'].forEach(function(k){out[k]=String(e[k]||'').trim();if(out[k].length>(k==='notes'?10000:500))throw Error('Booking '+k+' is too long');});
  return out;
}
function workCalendarSave_(body){
  workCalendarPermissions_();var company=workCalendarCompany_(body),u=auth_(body,['Admin','Technician']);
  if(!permissionAllowed_(u,company,'calendar.edit'))throw Error('Calendar scheduling permission required');
  var event=workCalendarEvent_(body.event,company),lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    var sh=ttSheet_('ScheduledJobs',['ID','Company','Date','Start','End','Technician','Data JSON','Updated','Created By']);
    var found=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,1).createTextFinder(event.id).matchEntireCell(true).useRegularExpression(false).findNext():null;
    var row=found?found.getRow():0;
    if(row&&String(sh.getRange(row,2).getValue())!==company)throw Error('Booking belongs to another company');
    var now=new Date();event.updatedAt=now.getTime();event.createdBy=row?String(sh.getRange(row,9).getValue()):u.username;
    var values=[event.id,company,event.date,event.startTime,event.endTime,event.technician,JSON.stringify(event),now,event.createdBy];
    if(row)sh.getRange(row,1,1,values.length).setValues([values]);else{sh.appendRow(values);row=sh.getLastRow();}
    sh.getRange(row,8).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    log_(u.username,'scheduleJob',event.id,company,event.customer);
    return {ok:true,id:event.id,updatedAt:event.updatedAt,event:event};
  }finally{lock.releaseLock();}
}
function workCalendarList_(u,company,body){
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ScheduledJobs'),events=[];
  if(!sh||sh.getLastRow()<2)return events;
  var window=body.bookingId?{bookingId:String(body.bookingId)}:ttCalendarWindow_(body);
  sh.getRange(2,1,sh.getLastRow()-1,9).getValues().forEach(function(row){
    if(row[1]!==company)return;
    if(window&&window.bookingId&&row[0]!==window.bookingId)return;
    if(window&&!window.bookingId&&(row[2]<window.from||row[2]>window.to))return;
    var e=JSON.parse(row[6]);
    if(u.role==='Worker'&&!jobCardAssigned_(e.technician,u.name))return;
    events.push(e);
  });return events;
}
function workCalendarRead_(body){
  workCalendarPermissions_();var company=workCalendarCompany_(body),u=auth_(body,['Admin','Technician','Worker']);
  var result=body.bookingId&&String(body.bookingId).indexOf('tt:')!==0?{ok:true,events:[]}:company==='Hi Service'?hiCalendar_(body):calendarList_(body);
  result.events=result.events.concat(jobCompletionOverlay_(workCalendarList_(u,company,body),company));
  result.backupStatus=PropertiesService.getScriptProperties().getProperty('TIMETREE_BACKUP_STATUS')||'Not started';
  return result;
}

function workCalendarCompletion_(body){
  var u=auth_(body,['Admin','Technician','Worker']),company=body.company==='Hi Service'?'Hi Service':'Flagship Solar';
  var date=String(body.occurrenceDate||''),id=String(body.eventId||'');
  var visible=workCalendarList_(u,company,{bookingId:id});
  if(!visible.length)return calendarCompletionSet_(body);
  if(typeof body.completed!=='boolean'||date!==visible[0].date)throw Error('Invalid completion date or status');
  var lock=LockService.getScriptLock();lock.waitLock(15000);
  try{var now=new Date();jobCompletionSheet_().appendRow([id,company,visible[0].jobNo,String(u.name||u.username),now,body.completed?'COMPLETED':'REOPENED','',u.username,now,date]);}
  finally{lock.releaseLock();}
  return {ok:true,eventId:id,completed:body.completed,completedBy:String(u.name||u.username)};
}
