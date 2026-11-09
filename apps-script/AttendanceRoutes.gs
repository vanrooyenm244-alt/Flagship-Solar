/* New attendance routes delegate every unrelated action to the preserved live router. */
function doGet(e){
 var p=e&&e.parameter||{},body={user:p.user,pass:p.pass,action:p.action,company:p.company,id:p.id,from:p.from,to:p.to,bookingId:p.bookingId,jobNo:p.jobNo};
 try{
  workCalendarPermissions_();
  if(p.action==='googleCalendarStatus')return out_(workGoogleStatus_(body));
  if(p.action==='quoteJob'||p.action==='hiQuoteJob')return out_(quoteJobRead_(body));
  if(p.action==='calendar'||p.action==='hiCalendar')return out_(workCalendarRead_(body));
  if(p.action==='timesheetAll'||p.action==='entries')return withTimesheetContext_(body.company||'Flagship Solar',function(){return attendanceLegacyGet_(e);});
  if(p.action==='attendanceRecords')return withTimesheetContext_(body.company||'Flagship Solar',function(){var result=tsRecords_(Object.assign({},body,p));if(result.admin)syncMonthlyOvertimeSafely_();return out_(result);});
  if(p.action==='attendanceHistory')return withTimesheetContext_(body.company||'Flagship Solar',function(){return out_(tsHistory_(Object.assign({},body,p)));});
  if(p.action==='timesheetPending')return withTimesheetContext_(body.company||'Flagship Solar',function(){return out_({ok:true,entries:tsPendingList_(auth_(body))});});
  if(p.action==='flagshipClockStatus')return out_(flagshipClockStatus_(body));
  if(p.action==='hiClockStatus')return withTimesheetContext_('Hi Service',function(){return out_(hiClockStatus_(body));});
  if(p.action==='poRecent')return out_(poRecent_(body));
  if(p.action==='hiXeroContacts'){auth_(body);return out_(xeroContacts_(p.q||''));}
  if(p.action==='hiXeroStatus'){auth_(body);var status=xeroStatus_();status.company='Hi Service';status.mode='shared';return out_(status);}
 }catch(error){return out_({ok:false,error:String(error.message||error)});}
 return attendanceLegacyGet_(e);
}
function doPost(e){
 var body={};try{body=JSON.parse(e&&e.postData&&e.postData.contents||'{}');}catch(ignore){return attendanceLegacyPost_(e);}
 try{
  workCalendarPermissions_();
  if(body.action==='googleCalendarStatus')return out_(workGoogleStatus_(body));
  if(body.action==='calendarCancel'||body.action==='hiCalendarCancel')return out_(workGoogleCancel_(body));
  if(body.action==='quoteJob'||body.action==='hiQuoteJob')return out_(quoteJobRead_(body));
  if(body.action==='calendarCompletionSet')return out_(workCalendarCompletion_(body));
  if(body.action==='calendarTechnicians'||body.action==='hiCalendarTechnicians')return out_(workCalendarTechnicians_(body));
  if(body.action==='calendarNotifications'||body.action==='hiCalendarNotifications')return out_(workCalendarNotifications_(body));
  if(body.action==='calendarNotificationsAck'||body.action==='hiCalendarNotificationsAck')return out_(workCalendarNotificationsAck_(body));
  if(body.action==='scheduleJob'||body.action==='hiScheduleJob')return out_(workCalendarSave_(body));
  if(body.action==='calendar'||body.action==='hiCalendar')return out_(workCalendarRead_(body));
  if(body.action==='attendanceManage')return withTimesheetContext_(body.company||'Flagship Solar',function(){return out_(tsManage_(body));});
  if(body.action==='timesheetReview')return withTimesheetContext_(body.company||'Flagship Solar',function(){return out_(tsReview_(auth_(body),body));});
  if(body.action==='timesheets')return withTimesheetContext_(body.company||'Flagship Solar',function(){return out_(tsStage_(auth_(body),body.rows||[]));});
  if(body.action==='flagshipClockAction')return withTimesheetContext_('Flagship Solar',function(){return out_(flagshipClockAction_(body));});
  if(body.action==='hiClockAction')return withTimesheetContext_('Hi Service',function(){return out_(hiClockAction_(body));});
  if(body.action==='timesheetDelete'){auth_(body);return out_({ok:false,error:'Use Attendance review to cancel an incorrect entry with a reason.'});}
 }catch(error){return out_({ok:false,error:String(error.message||error)});}
 return attendanceLegacyPost_(e);
}



