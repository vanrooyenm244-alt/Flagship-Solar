/* Attendance review: originals remain in an append-only audit sheet. */
function tsAuditSheet_(){
 var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('Timesheet Audit');
 if(!sh){sh=ss.insertSheet('Timesheet Audit');sh.appendRow(['ID','Recorded At','Changed By','Action','Worker','Date','Reason','Before JSON','After JSON']);}
 return sh;
}
function tsAudit_(u,action,worker,date,reason,before,after){
 tsAuditSheet_().appendRow([Utilities.getUuid(),new Date(),u.username,action,worker,date,reason,JSON.stringify(before||null),JSON.stringify(after||null)]);
}
function tsRecords_(body){
 var u=auth_(body),admin=u.role==='Admin',who=canonicalWorkerForUser_(u),ss=SpreadsheetApp.getActiveSpreadsheet(),out=[];
 if(!permissionAllowed_(u,permissionCompany_(body),'timesheets.view_own'))throw Error('Timesheet access required');
 var sh=ss.getSheetByName('Timesheets'),ap=ss.getSheetByName('Timesheet Approvals'),approvals=ap&&ap.getLastRow()>1?ap.getRange(2,1,ap.getLastRow()-1,10).getValues():[];
 function allowed(w){return admin||String(w).trim().toLowerCase()===String(who).trim().toLowerCase();}
 if(sh&&sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,14).getValues().forEach(function(r){
  if(!r[0]||!r[3]||!allowed(r[3]))return;
  var ds=dateStr_(r[0]),match=null;
  approvals.forEach(function(a){if(a[6]==='Approved'&&String(a[1])===String(r[3])&&dateStr_(a[2])===ds)match=a;});
  out.push({id:'',worker:String(r[3]),date:ds,timeIn:timeTxt_(r[5]).replace(/^'/,''),timeOut:timeTxt_(r[6]).replace(/^'/,''),lunch:Number(r[7]),job:String(r[4]||''),note:String(r[11]||''),normal:Number(r[8]),overtime:Number(r[9]),publicHoliday:String(r[2]).toLowerCase().indexOf('holiday')>=0,status:'Approved',submittedBy:match?String(match[4]):'Legacy record — not recorded',submittedAt:match?String(match[5]):'',approvedBy:match?String(match[7]):String(r[12]||''),approvedAt:match?String(match[8]):String(r[13]||'')});
 });
 approvals.forEach(function(r){if(!allowed(r[1])||['Pending','Rejected','Cancelled'].indexOf(String(r[6]))<0)return;var p;try{p=JSON.parse(String(r[3]));}catch(e){return;}var c=calc_(p.date,p.timeIn,p.timeOut,p.lunch)||{};out.push({id:String(r[0]),worker:String(r[1]),date:dateStr_(r[2]),timeIn:p.timeIn,timeOut:p.timeOut,lunch:p.lunch,job:p.job||'',note:p.note||'',normal:c.normal||0,overtime:c.overtime||0,publicHoliday:String(c.dayType||'').toLowerCase().indexOf('holiday')>=0,status:String(r[6]),submittedBy:String(r[4]),submittedAt:String(r[5]),approvedBy:r[6]==='Approved'?String(r[7]):'',reviewedBy:String(r[7]||''),approvedAt:String(r[8]||'')});});
 out.sort(function(a,b){return a.worker.localeCompare(b.worker)||a.date.localeCompare(b.date)||a.status.localeCompare(b.status);});
 out.forEach(function(r){r.version=JSON.stringify(r);r.cycle=cycleKey_(cycleOf_(new Date(r.date+'T12:00:00')));});
 return {ok:true,admin:admin,entries:out};
}
function tsManage_(body){
 var u=auth_(body);if(u.role!=='Admin')throw Error('Only Admin may correct or cancel timesheets');
 var reason=String(body.reason||'').trim();if(reason.length<3)throw Error('Enter a reason for this change');
 var action=String(body.operation||'');if(['correct','cancel','approve','reject'].indexOf(action)<0)throw Error('Invalid timesheet operation');
 var lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  var records=tsRecords_(body).entries,old=records.find(function(r){return r.version===body.version;});
  if(!old)throw Error('This row changed. Refresh before editing it.');
  if(['Approved','Pending'].indexOf(old.status)<0)throw Error('This record has already been closed');
  if(action==='approve'||action==='reject'){
   if(old.status!=='Pending')throw Error('Only pending submissions can be reviewed');
   return tsReview_(u,{id:old.id,decision:action,reason:reason});
  }
  var data=body.entry||{},next=null;
  if(action==='correct'){
   var date=String(data.date||''),parsed=new Date(date+'T12:00:00Z');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||isNaN(parsed)||parsed.toISOString().slice(0,10)!==date||date>hiClockToday_())throw Error('Enter a valid date, not a future date');
   if(data.lunch==null||String(data.lunch).trim()==='')throw Error('Enter break minutes explicitly (0 is valid)');
   next={worker:old.worker,date:date,timeIn:String(data.timeIn||''),timeOut:String(data.timeOut||''),lunch:Number(data.lunch),job:String(data.job||''),note:String(data.note||'')};
   if(!calc_(next.date,next.timeIn,next.timeOut,next.lunch))throw Error(shiftReviewReason_(next.date,next.timeIn,next.timeOut,next.lunch));
   if(date!==old.date&&records.some(function(r){return r.worker===old.worker&&r.date===date&&['Pending','Approved'].indexOf(r.status)>=0;}))throw Error('A timesheet already exists on the new date');
  }
  var sh=tsApprovalSheet_(),values=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,10).getValues():[],at=values.findIndex(function(r){return old.id?String(r[0])===old.id:r[6]==='Approved'&&String(r[1])===old.worker&&dateStr_(r[2])===old.date;});
  var master=old.status==='Approved'?findEntry_(old.worker,old.date):null;
  if(master)preflightWorkerTabs_([old.worker],true);
  // Preserve the exact original and proposed replacement BEFORE touching payroll.
  tsAudit_(u,action,old.worker,old.date,reason,old,next);
  if(old.status==='Pending'){
   if(at<0)throw Error('Submission no longer exists');
   if(next){sh.getRange(at+2,3,1,2).setValues([[next.date,JSON.stringify(next)]]);sh.getRange(at+2,8,1,3).setValues([[u.username,new Date(),'Corrected: '+reason]]);}
   else sh.getRange(at+2,7,1,4).setValues([['Cancelled',u.username,new Date(),reason]]);
  }else{
   if(!master)throw Error('Approved timesheet no longer exists');
   if(next){var result=writeEntry_(u,next);if(result.skipped)throw Error(result.reason||'Invalid shift');}
   if(!next||next.date!==old.date)sheet_('Timesheets').deleteRow(master);
   if(at>=0){if(next)sh.getRange(at+2,3,1,2).setValues([[next.date,JSON.stringify(next)]]);sh.getRange(at+2,7,1,4).setValues([[next?'Approved':'Cancelled',u.username,new Date(),reason]]);}
   else if(!next)sh.appendRow([Utilities.getUuid(),old.worker,old.date,JSON.stringify(old),old.submittedBy,old.submittedAt,'Cancelled',u.username,new Date(),reason]);
   rebuildWorkerTabs([old.worker]);
  }
  return {ok:true,status:next?'Corrected':'Cancelled'};
 }finally{lock.releaseLock();}
}
function tsHistory_(body){
 var u=auth_(body),worker=String(body.worker||'');
 if(u.role!=='Admin'&&worker.toLowerCase()!==canonicalWorkerForUser_(u).toLowerCase())throw Error('Own attendance history only');
 var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Timesheet Audit'),out=[];
 if(sh&&sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,9).getValues().forEach(function(r){if(String(r[4])===worker)out.push({at:String(r[1]),by:String(r[2]),action:String(r[3]),date:dateStr_(r[5]),reason:String(r[6]),before:String(r[7]),after:String(r[8])});});
 return {ok:true,history:out.slice(-200).reverse()};
}
