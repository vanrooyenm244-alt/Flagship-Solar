/* Automatically rebuild the company Monthly Overtime sheet from submitted and approved timesheets. */
var MONTHLY_OVERTIME_HEADERS_ = [
  'Employee','Day','Date Worked','Client','Reason','Starting Time','Completion Time',
  'Hours','Public Holiday','Supervisor Sign-Off','Freddie Sign-Off','Outcome',
  'Job ID','Submitted By','Approved At','Source Status'
];

function monthlyOvertimeKey_(employee,date,client,start,end){
  return [employee,date,client,start,end].map(function(x){return String(x||'').trim().toLowerCase();}).join('|');
}

function syncMonthlyOvertime_(){
  var ss=timesheetSpreadsheet_(),company=TIMESHEET_CONTEXT_?TIMESHEET_CONTEXT_.company:'Flagship Solar';
  var sh=ss.getSheetByName('Monthly Overtime');
  if(!sh)sh=ss.insertSheet('Monthly Overtime');
  if(sh.getMaxColumns()<16)sh.insertColumnsAfter(sh.getMaxColumns(),16-sh.getMaxColumns());
  sh.getRange(5,1,1,15).setValues([MONTHLY_OVERTIME_HEADERS_.slice(0,15)])
    .setFontWeight('bold').setBackground('#1F4E79').setFontColor('#FFFFFF');
  sh.getRange('A1').setValue('MONTHLY OVERTIME SHEET');
  sh.getRange('A2:B2').setValues([['NAME:','All employees']]);
  sh.getRange('A3:B3').setValues([['DEPARTMENT:',company]]);
  sh.getRange('A4:B4').setValues([['PERIOD:','All months · auto-updated']]);
  sh.setFrozenRows(5);

  var oldFreddie=Object.create(null),oldLast=sh.getLastRow();
  if(oldLast>5){
    sh.getRange(6,1,oldLast-5,15).getValues().forEach(function(r){
      if(r[0]&&r[2])oldFreddie[monthlyOvertimeKey_(r[0],dateStr_(r[2]),r[3],r[5],r[6])]=r[10]===true;
    });
    sh.getRange(6,1,oldLast-5,16).clearContent();
  }

  var approvals=ss.getSheetByName('Timesheet Approvals'),approvalRows=[];
  if(approvals&&approvals.getLastRow()>1)approvalRows=approvals.getRange(2,1,approvals.getLastRow()-1,10).getValues();
  var master=ss.getSheetByName('Timesheets'),masterRows=[];
  if(master&&master.getLastRow()>1)masterRows=master.getRange(2,1,master.getLastRow()-1,14).getValues();
  var rows=[],seen=Object.create(null);

  approvalRows.forEach(function(a){
    var status=String(a[6]||'');
    if(['Pending','Approved','Rejected'].indexOf(status)<0)return;
    var p;try{p=JSON.parse(String(a[3]||'{}'));}catch(e){return;}
    var c=calc_(p.date,p.timeIn,p.timeOut,p.lunch);if(!c||Number(c.overtime)<=0)return;
    var worker=String(a[1]||p.worker||'').trim(),date=dateStr_(a[2]||p.date);
    var key=monthlyOvertimeKey_(worker,date,p.job,p.timeIn,p.timeOut);
    seen[key]=true;
    rows.push([
      worker,c.day,date,String(p.job||''),String(p.note||''),String(p.timeIn||''),String(p.timeOut||''),
      Number(c.overtime)||0,String(c.dayType||'').toLowerCase().indexOf('holiday')>=0,
      status==='Approved'&&!!a[7],oldFreddie[key]===true,'',String(p.jobId||p.jobID||''),
      String(a[4]||''),status==='Approved'?(a[8]||''):'',status
    ]);
  });

  masterRows.forEach(function(r){
    var worker=String(r[3]||'').trim(),date=dateStr_(r[0]),client=String(r[4]||'');
    var start=timeTxt_(r[5]).replace(/^'/,''),end=timeTxt_(r[6]).replace(/^'/,'');
    if(!worker||!date||Number(r[9])<=0)return;
    var key=monthlyOvertimeKey_(worker,date,client,start,end);if(seen[key])return;
    rows.push([
      worker,String(r[1]||''),date,client,String(r[11]||''),start,end,Number(r[9])||0,
      String(r[2]||'').toLowerCase().indexOf('holiday')>=0,true,oldFreddie[key]===true,'',
      '',String(r[12]||''),r[13]||'','Approved'
    ]);
  });

  rows.sort(function(a,b){return String(b[2]).localeCompare(String(a[2]))||String(a[0]).localeCompare(String(b[0]));});
  if(rows.length){
    sh.getRange(6,9,rows.length,3).insertCheckboxes();
    sh.getRange(6,1,rows.length,16).setValues(rows);
    sh.getRange(6,12,rows.length,1).setFormulas(rows.map(function(_,i){
      var r=i+6;
      return ['=IF(P'+r+'="Rejected","Rejected",IF(P'+r+'="Cancelled","Cancelled",IF(P'+r+'<>"Approved","Pending supervisor approval",IF(J'+r+'<>TRUE,"Pending supervisor approval",IF(K'+r+'<>TRUE,"Awaiting Freddie approval","Approved")))))'];
    }));
    sh.getRange(6,3,rows.length,1).setNumberFormat('yyyy-mm-dd');
    sh.getRange(6,15,rows.length,1).setNumberFormat('yyyy-mm-dd hh:mm');
  }
  try{var f=sh.getFilter();if(f)f.remove();sh.getRange(5,1,Math.max(rows.length+1,1),15).createFilter();}catch(ignore){}
  try{sh.hideColumns(16);}catch(ignore2){}
  return {ok:true,rows:rows.length,company:company};
}

function syncMonthlyOvertimeSafely_(){
  try{return syncMonthlyOvertime_();}
  catch(e){console.error('Monthly Overtime refresh failed: '+String(e&&e.stack||e));return {ok:false,error:String(e&&e.message||e)};}
}
