// STAGING ONLY. Never add this file to a production Apps Script project.
function rcCheckTimesheetScoped() {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss||ss.getId()!=='1HNpkEoRIWiovuVC6sYydTmXwBHHOh8aRYs6YVG8hfFs')throw new Error('Wrong staging Sheet.');
  if(Object.keys(PropertiesService.getScriptProperties().getProperties()).length)throw new Error('External properties must be absent.');
  var master=ss.getSheetByName('Timesheets'),before=master.getDataRange().getValues();
  var ian=ss.getSheetByName('Ian'),ianBefore=JSON.stringify(ian.getDataRange().getValues());
  var id='rc'+Utilities.getUuid().replace(/-/g,'').slice(0,12),name='RC Lunch '+id,pass=Utilities.getUuid();
  ss.getSheetByName('Users').appendRow([id,name,'Admin','Active',hash_(id,pass),new Date(),'']);
  function expect(ok,msg){if(!ok)throw new Error(msg);}
  function send(rows){return JSON.parse(doPost({postData:{contents:JSON.stringify({action:'timesheets',user:id,pass:pass,rows:rows})}}).getContent());}
  var row={worker:name,date:'2026-09-23',timeIn:'07:00',timeOut:'17:00',lunch:60,job:'RC SYNTHETIC ONLY'};
  var accepted=send([row,Object.assign({},row,{lunch:''})]);
  expect(accepted.ok&&accepted.results[0].status==='added'&&accepted.results[1].status==='skipped',JSON.stringify(accepted));
  var saved=master.getRange(master.getLastRow(),1,1,14).getValues()[0];
  expect(saved[3]===name&&saved[7]===60&&saved[8]===9&&saved[9]===0&&saved[10]===9,'Wrong persisted lunch/hours');
  var count=master.getLastRow(),retry=send([row]);
  expect(retry.ok&&retry.results[0].status==='unchanged'&&master.getLastRow()===count,'Retry duplicated or failed');
  expect(JSON.stringify(master.getRange(1,1,before.length,before[0].length).getValues())===JSON.stringify(before),'Historical master rows changed');
  expect(JSON.stringify(ian.getDataRange().getValues())===ianBefore,'Ian changed');
  console.log(JSON.stringify({fixture:id,accepted:accepted,retry:retry,persistedLunch:60,normal:9,total:9,historicalMasterUnchanged:true,ianUnchanged:true}));
}

// Pure calculation verification: no Sheet reads or writes.
function rcCheckApprovedLunch() {
  var cases=[['07:00','17:00',60,9,0,9],['07:00','17:00',0,10,0,10],['04:00','05:00',0,0,1,1],['18:00','19:00',0,0,1,1],['22:00','02:00',0,0,4,4]];
  var results=cases.map(function(c){var r=calc_('2026-09-23',c[0],c[1],c[2]);return {start:c[0],end:c[1],lunch:c[2],result:r,pass:!!r&&r.normal===c[3]&&r.overtime===c[4]&&r.total===c[5]};});
  console.log(JSON.stringify(results));
  if(results.some(function(r){return !r.pass;}))throw new Error('Calculation verification failed.');
}

// Read-only diagnostic: never adopts, clears, reformats or changes worker tabs.
function rcInspectIan() {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss||ss.getId()!=='1HNpkEoRIWiovuVC6sYydTmXwBHHOh8aRYs6YVG8hfFs')throw new Error('Wrong staging Sheet.');
  var sh=ss.getSheetByName('Ian');
  var expected=workerMasterRows_().filter(function(r){return String(r[3]||'').trim()==='Ian';}).map(workerProjection_);
  var actual=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,WORKER_COLS.length).getValues():[];
  var formulas=actual.length?sh.getRange(2,1,actual.length,WORKER_COLS.length).getFormulas():[];
  function cell(v){return {type:v instanceof Date?'Date':typeof v,value:v instanceof Date?v.toISOString():v};}
  function key(r){return workerRowFingerprint_(r.slice(0,1));}
  var remaining=actual.slice(),diff=[];
  expected.forEach(function(r){
    var idx=remaining.findIndex(function(a){return key(a)===key(r);});
    if(idx<0){diff.push({missingDate:cell(r[0])});return;}
    var a=remaining.splice(idx,1)[0],cells=[];
    r.forEach(function(v,c){if(workerRowFingerprint_([v])!==workerRowFingerprint_([a[c]]))cells.push({column:WORKER_COLS[c],master:cell(v),worker:cell(a[c])});});
    if(cells.length)diff.push({date:cell(r[0]),cells:cells});
  });
  console.log(JSON.stringify({worker:'Ian',expectedRows:expected.length,actualRows:actual.length,formulaCells:formulas.reduce(function(n,r){return n+r.filter(Boolean).length;},0),differences:diff,extraDates:remaining.map(function(r){return cell(r[0]);})}));
}

function rcStageCheck() {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss||ss.getId()!=='1HNpkEoRIWiovuVC6sYydTmXwBHHOh8aRYs6YVG8hfFs')throw new Error('Refusing to run outside the verified staging Sheet.');
  if(Object.keys(PropertiesService.getScriptProperties().getProperties()).length)throw new Error('Staging must have no external service properties for this test.');
  var names=['Users','Timesheets','JobCards','Stock','Proposals','Prices'];
  var baseline={};names.forEach(function(n){var sh=ss.getSheetByName(n);baseline[n]={rows:sh.getLastRow(),cols:sh.getLastColumn(),json:JSON.stringify(sh.getDataRange().getValues())};});
  var id='rc'+Utilities.getUuid().replace(/-/g,'').slice(0,12),name='RC Test '+id,pass=Utilities.getUuid();
  ss.getSheetByName('Users').appendRow([id,name,'Admin','Active',hash_(id,pass),new Date(),'']);
  var results=[];
  function check(label,fn){try{fn();results.push({test:label,pass:true});}catch(e){results.push({test:label,pass:false,error:String(e.message||e)});}}
  function expect(ok,message){if(!ok)throw new Error(message);}
  function post(body){body.user=id;body.pass=pass;return JSON.parse(doPost({postData:{contents:JSON.stringify(body)}}).getContent());}
  function get(body){body.user=id;body.pass=pass;return JSON.parse(doGet({parameter:body}).getContent());}
  check('real Google me/login',function(){expect(get({action:'me'}).user.username===id,'me mismatch');expect(post({action:'login'}).ok,'login rejected');});
  check('real Google invalid credentials',function(){var r=JSON.parse(doGet({parameter:{action:'me',user:id,pass:'incorrect'}}).getContent());expect(!r.ok&&r.error==='unknown user or password','wrong password was not rejected');});
  check('real Google Timesheet accept/reject/retry',function(){
    var date=Utilities.formatDate(new Date(),'Africa/Johannesburg','yyyy-MM-dd');
    var row={worker:name,date:date,timeIn:'07:00',timeOut:'17:00',lunch:0,job:'RC STAGING ONLY'};
    var r=post({action:'timesheets',rows:[row,Object.assign({},row,{lunch:''})]});
    expect(r.ok,JSON.stringify(r));expect(r.results[0].status==='added'&&r.results[1].status==='skipped',JSON.stringify(r));
    var retry=post({action:'timesheets',rows:[row]});expect(retry.ok&&retry.results[0].status==='unchanged',JSON.stringify(retry));
  });
  check('real Google Job Card save/edit/reopen/delete',function(){
    var card={id:id,number:id,customer:'RC SYNTHETIC',site:'STAGING ONLY',date:'2026-09-24',technicians:name,types:['custom'],sections:{},status:'SUBMITTED'};
    expect(post({action:'jobCardSave',jobCard:card}).id===id,'save not acknowledged');card.site='RC edited';expect(post({action:'jobCardSave',jobCard:card}).ok,'edit failed');
    var list=get({action:'jobCards'});expect(list.jobCards.some(function(x){return x.id===id&&x.data.site==='RC edited';}),'reopen failed');
    expect(post({action:'jobCardDelete',id:id}).ok,'delete failed');expect(!get({action:'jobCards'}).jobCards.some(function(x){return x.id===id;}),'deleted row remains');
  });
  check('real Google Stock zero/unknown/other locations',function(){
    var item='RC '+id;ss.getSheetByName('Stock').appendRow([item,'Other','each',1,5,7,9,'','','']);
    var counts={};counts[item]=0;counts[item+' unknown']=2;var r=post({action:'stockCount',place:'Store',counts:counts});
    expect(r.ok&&r.unknown.indexOf(item+' unknown')>=0,JSON.stringify(r));var x=stockRows_().filter(function(x){return x.item===item;})[0];expect(x.Store===0&&x.GWM===7&&x.NP200===9,'other locations changed');
  });
  check('real Google Proposal publish/view/accept',function(){
    var r=post({action:'proposalPublish',proposal:{no:id,client:'RC SYNTHETIC',items:[{desc:'Test only',qty:2,sell:100}]}});expect(r.ok&&r.token,'publish failed');expect(proposalPublicHtml_(r.token).getContent().indexOf('230')>=0,'total mismatch');expect(proposalAccept_(r.token,'RC Test').status==='ACCEPTED','accept failed');
  });
  check('Xero disconnected',function(){var r=get({action:'xeroStatus'});expect(r.ok&&!r.xero.connected&&!r.xero.configured,'Unexpected Xero connection');});
  check('original business records unchanged',function(){names.forEach(function(n){var b=baseline[n],sh=ss.getSheetByName(n);expect(JSON.stringify(sh.getRange(1,1,b.rows,b.cols).getValues())===b.json,n+' original rows changed');});});
  console.log(JSON.stringify({sheetId:ss.getId(),fixture:id,results:results}));
  if(results.some(function(r){return !r.pass;}))throw new Error('Staging checks failed; inspect JSON results.');
}
