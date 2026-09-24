// STAGING ONLY. Never add this file to a production Apps Script project.
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
