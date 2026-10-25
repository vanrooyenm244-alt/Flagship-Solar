/* New attendance routes delegate every unrelated action to the preserved live router. */
function doGet(e){
 var p=e&&e.parameter||{},body={user:p.user,pass:p.pass,action:p.action,company:p.company};
 try{
  if(p.action==='attendanceRecords')return out_(tsRecords_(Object.assign({},body,p)));
  if(p.action==='attendanceHistory')return out_(tsHistory_(Object.assign({},body,p)));
  if(p.action==='timesheetPending')return out_({ok:true,entries:tsPendingList_(auth_(body))});
  if(p.action==='flagshipClockStatus')return out_(flagshipClockStatus_(body));
  if(p.action==='hiClockStatus')return out_(hiClockStatus_(body));
  if(p.action==='poRecent')return out_(poRecent_(body));
  if(p.action==='hiXeroContacts'){auth_(body);return out_(xeroContacts_(p.q||''));}
  if(p.action==='hiXeroStatus'){auth_(body);var status=xeroStatus_();status.company='Hi Service';status.mode='shared';return out_(status);}
 }catch(error){return out_({ok:false,error:String(error.message||error)});}
 return attendanceLegacyGet_(e);
}
function doPost(e){
 var body={};try{body=JSON.parse(e&&e.postData&&e.postData.contents||'{}');}catch(ignore){return attendanceLegacyPost_(e);}
 try{
  if(body.action==='attendanceManage')return out_(tsManage_(body));
  if(body.action==='timesheetReview')return out_(tsReview_(auth_(body),body));
  if(body.action==='timesheets')return out_(tsStage_(auth_(body),body.rows||[]));
  if(body.action==='flagshipClockAction')return out_(flagshipClockAction_(body));
  if(body.action==='hiClockAction')return out_(hiClockAction_(body));
  if(body.action==='timesheetDelete'){auth_(body);return out_({ok:false,error:'Use Attendance review to cancel an incorrect entry with a reason.'});}
 }catch(error){return out_({ok:false,error:String(error.message||error)});}
 return attendanceLegacyPost_(e);
}
