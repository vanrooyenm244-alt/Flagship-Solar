'use strict';
function dateParts(ms,tz){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)),p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};}
function normalize(raw,calendar,targets=['Flagship Solar','Hi Service']) {
  if(!raw.uuid||!Number.isFinite(raw.start_at)||!Number.isFinite(raw.end_at))throw Error('TimeTree event missing identity or dates');
  const start=dateParts(raw.start_at,raw.all_day?'UTC':raw.start_timezone||'Africa/Johannesburg');
  const end=dateParts(raw.end_at,raw.all_day?'UTC':raw.end_timezone||raw.start_timezone||'Africa/Johannesburg');
  const users=calendar.calendar_users||[],names=(raw.attendees||[]).map(id=>{const u=users.find(u=>String(u.id)===String(id));return u?u.name:'TimeTree member '+id;});
  const label=(calendar.calendar_labels||[]).find(x=>String(x.id)===String(raw.label_id));
  return {id:`tt:${calendar.id}:${raw.uuid}`,source:'timetree',sourceCalendarId:String(calendar.id),sourceEventId:String(raw.uuid),calendarName:calendar.name,targets,customer:raw.title||'(Untitled booking)',site:raw.location||'',date:start.date,endDate:end.date,startTime:raw.all_day?'':start.time,endTime:raw.all_day?'':end.time,startAt:raw.start_at,endAt:raw.end_at,allDay:!!raw.all_day,timeZone:raw.start_timezone||'Africa/Johannesburg',technician:names.join(', '),jobType:label?.name||'',notes:raw.note||'',status:raw.deactivated_at?'ARCHIVED':'SCHEDULED',recurrences:raw.recurrences||[],recurringUuid:raw.recurring_uuid||'',sourceUrl:`https://timetreeapp.com/calendars/${calendar.alias_code}/events/${raw.uuid}`,sourceUpdatedAt:Number(raw.updated_at)||0,raw};
}
module.exports={normalize,dateParts};
