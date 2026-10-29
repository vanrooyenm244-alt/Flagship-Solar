/* Migration routing candidate. Staging branch only until data reconciliation and
 * deploy-time smoke tests. Each logical Hi Service sheet gets an explicit ID.
 * Stock staging and audit workbook are NOT interchangeable: do not cut over
 * without final backfill of live mutations and approval. */
var HI_MIGRATION_TARGETS_ = {
  HiService_Stock: '1NQC_6mruzvJczvR_oQyZT__ImQ3RV4NLs8Uo3eUSAh8',
  HiService_Stock_Counts: '1NQC_6mruzvJczvR_oQyZT__ImQ3RV4NLs8Uo3eUSAh8',
  HiService_Stock_Movements: '1NQC_6mruzvJczvR_oQyZT__ImQ3RV4NLs8Uo3eUSAh8',
  Timesheets: '1sbNYYAA2kXA7net9MEeduOGNOtk3hjyBIoJfeVbDovU'
};
function hiTargetSpreadsheet_(name) {
  var id=HI_MIGRATION_TARGETS_[name];
  if(!id) throw new Error('Missing explicit Hi Service Sheet route: '+name);
  return SpreadsheetApp.openById(id);
}

/**
 * Hi Service stock + timesheets module for the SAME Apps Script project used by Flagship.
 * Add this file to that Apps Script project, then add the two router calls shown in README.
 */
var HI_STOCK_SHEET='HiService_Stock';
var HI_COUNT_SHEET='HiService_Stock_Counts';
var HI_MOVE_SHEET='HiService_Stock_Movements';
var HI_TIME_SHEET='Timesheets';
var HI_PLACES=['Stoor','CEY 59799','CEY 67212'];
var HI_STOCK_HEAD=['Code','Description','Category','Supplier','Unit','Cost','Stoor','CEY 59799','CEY 67212','Total Stock','Active','Updated','By'];

function setupHiService(){
  var ss=hiTargetSpreadsheet_(HI_STOCK_SHEET);
  hiSheet_(ss,HI_STOCK_SHEET,HI_STOCK_HEAD);
  hiSheet_(hiTargetSpreadsheet_(HI_COUNT_SHEET),HI_COUNT_SHEET,['Timestamp','User','Location','Code','Description','Count']);
  hiSheet_(hiTargetSpreadsheet_(HI_MOVE_SHEET),HI_MOVE_SHEET,['Timestamp','User','Type','From','To','Code','Description','Qty','Reason','Reference']);
  hiTotals_();
  return 'Hi Service sheets ready';
}
function hiSheet_(ss,name,head){
  var sh=ss.getSheetByName(name)||ss.insertSheet(name);
  if(sh.getMaxColumns()<head.length)sh.insertColumnsAfter(sh.getMaxColumns(),head.length-sh.getMaxColumns());
  if(sh.getLastRow()<1)sh.getRange(1,1,1,head.length).setValues([head]).setFontWeight('bold').setBackground('#159447').setFontColor('#ffffff');
  sh.setFrozenRows(1);return sh;
}
function hiStockRows_(){
  var sh=hiTargetSpreadsheet_(HI_STOCK_SHEET).getSheetByName(HI_STOCK_SHEET);if(!sh)return[];
  var n=sh.getLastRow()-1;if(n<1)return[];
  return sh.getRange(2,1,n,HI_STOCK_HEAD.length).getValues().map(function(r,i){
    return {row:i+2,code:String(r[0]||''),item:String(r[1]||''),description:String(r[1]||''),category:String(r[2]||''),supplier:String(r[3]||''),unit:String(r[4]||'each'),cost:Number(r[5])||0,'Stoor':Number(r[6])||0,'CEY 59799':Number(r[7])||0,'CEY 67212':Number(r[8])||0,total:Number(r[9])||0,active:String(r[10]||'Yes').toLowerCase()!=='no'};
  }).filter(function(x){return x.item&&x.active;});
}
function hiTotals_(){
  var sh=hiTargetSpreadsheet_(HI_STOCK_SHEET).getSheetByName(HI_STOCK_SHEET);if(!sh)return;
  var n=sh.getLastRow()-1;if(n<1)return;var f=[];for(var i=0;i<n;i++)f.push(['=SUM(G'+(i+2)+':I'+(i+2)+')']);sh.getRange(2,10,n,1).setFormulas(f);
}
function hiFind_(codeOrName){
  var q=String(codeOrName||'').trim().toLowerCase(),matches=hiStockRows_().filter(function(x){return x.code.trim().toLowerCase()===q||x.item.trim().toLowerCase()===q;});
  if(matches.length>1)throw new Error('Duplicate stock code/description: '+codeOrName+'; review the stock sheet');
  return matches[0]||null;
}
function hiSetQty_(row,place,qty,user){
  var idx=HI_PLACES.indexOf(place);if(idx<0)throw new Error('Unknown Hi Service location');
  var sh=hiTargetSpreadsheet_(HI_STOCK_SHEET).getSheetByName(HI_STOCK_SHEET);
  sh.getRange(row,7+idx).setValue(Number(qty));sh.getRange(row,12).setValue(new Date());sh.getRange(row,13).setValue(user.username||user.name||'user');
}
function hiAdd_(u,it){
  var code=String(it.code||'').trim(),name=String(it.item||it.description||'').trim();if(!name)throw new Error('Description required');
  if((code&&hiFind_(code))||hiFind_(name))throw new Error('Item already exists');
  if(!code)code='HS-'+Utilities.getUuid().slice(0,8).toUpperCase();
  hiTargetSpreadsheet_(HI_STOCK_SHEET).getSheetByName(HI_STOCK_SHEET).appendRow([code,name,it.category||'Other',it.supplier||'',it.unit||'each',Number(it.cost)||0,0,0,0,'','Yes',new Date(),u.username||'']);
  hiTotals_();return {code:code,item:name};
}
function hiCount_(u,place,counts){
  if(HI_PLACES.indexOf(place)<0)throw new Error('Unknown location');
  var changed=0,unknown=[],rejected=[],ss=hiTargetSpreadsheet_(HI_COUNT_SHEET);
  var sh=hiSheet_(ss,HI_COUNT_SHEET,['Timestamp','User','Location','Code','Description','Count','Old','Movement']);
  sh.getRange(1,7,1,2).setValues([['Old','Movement']]);
  Object.keys(counts||{}).forEach(function(key){
    var it;try{it=hiFind_(key);}catch(e){rejected.push(key);return;}var raw=counts[key],q=Number(raw);if(!it){unknown.push(key);return;}
    if(raw===null||raw===undefined||typeof raw==='boolean'||String(raw).trim()===''||!isFinite(q)||q<0||Math.floor(q)!==q){rejected.push(key);return;}
    var old=it[place];if(old!==q){hiSetQty_(it.row,place,q,u);changed++;}
    sh.appendRow([new Date(),u.username||'',place,it.code,it.item,q,old,q-old]);
  });
  hiTotals_();return {changed:changed,unknown:unknown,rejected:rejected};
}
function hiMove_(u,from,to,lines,type,reason,ref,requestId){
  var ss=hiTargetSpreadsheet_(HI_MOVE_SHEET),existingLog=ss.getSheetByName(HI_MOVE_SHEET);
  requestId=String(requestId||'').trim();
  if(requestId&&existingLog&&existingLog.getLastRow()>1){var logged=existingLog.getRange(2,1,existingLog.getLastRow()-1,Math.min(11,existingLog.getMaxColumns())).getValues().filter(function(r){return String(r[10])===requestId&&String(r[1])===String(u.username)&&String(r[2])===type;});if(logged.length)return {changed:logged.length,unchanged:true};}
  if(['transfer','receive','adjust','issue'].indexOf(type)<0)throw new Error('Unknown movement type');
  if((type==='transfer'||type==='issue')&&(!from||!to||from===to))throw new Error('Choose two different locations');
  if((type==='transfer'||type==='adjust'||type==='issue')&&HI_PLACES.indexOf(from)<0)throw new Error('Unknown source');
  if((type==='transfer'||type==='receive')&&HI_PLACES.indexOf(to)<0)throw new Error('Unknown destination');
  if(type==='issue'&&(to!=='Kleinmond'||!String(ref||'').trim()))throw new Error('Kleinmond destination and job/reference required');
  if(!Array.isArray(lines)||!lines.length)throw new Error('Add stock lines first');
  // Validate the entire request, including repeated lines, before changing quantities.
  var plans=Object.create(null),order=[];
  lines.forEach(function(l){
    var it=hiFind_(l.code||l.item),raw=l.qty,q=Number(raw);
    if(!it)throw new Error('Unknown stock item: '+(l.code||l.item));
    if(raw===null||raw===undefined||typeof raw==='boolean'||String(raw).trim()===''||!isFinite(q)||Math.floor(q)!==q||q===0||(type!=='adjust'&&q<0))throw new Error('Invalid quantity: '+it.item);
    if(!plans[it.row]){plans[it.row]={item:it,qty:0};order.push(it.row);}
    plans[it.row].qty+=q;
  });
  order.forEach(function(key){var p=plans[key],it=p.item,q=p.qty;
    if((type==='transfer'||type==='issue')&&it[from]<q)throw new Error(it.item+' only has '+it[from]+' in '+from);
    if(type==='adjust'&&it[from]+q<0)throw new Error(it.item+' would become negative');
  });
  var log=hiSheet_(hiTargetSpreadsheet_(HI_MOVE_SHEET),HI_MOVE_SHEET,['Timestamp','User','Type','From','To','Code','Description','Qty','Reason','Reference','Request ID']),done=0;
  log.getRange(1,11).setValue('Request ID');
  order.forEach(function(key){var p=plans[key],it=p.item,q=p.qty;if(!q)return;
    if(type==='transfer'){hiSetQty_(it.row,from,it[from]-q,u);hiSetQty_(it.row,to,it[to]+q,u);}
    else if(type==='issue')hiSetQty_(it.row,from,it[from]-q,u);
    else if(type==='receive')hiSetQty_(it.row,to,it[to]+q,u);
    else hiSetQty_(it.row,from,it[from]+q,u);
    log.appendRow([new Date(),u.username||'',type,from||'',to||'',it.code,it.item,q,reason||'',ref||'',requestId]);done++;
  });hiTotals_();return {changed:done};
}
function hiTime_(u,row){
  var ss=hiTargetSpreadsheet_(HI_TIME_SHEET),tz=ss.getSpreadsheetTimeZone()||Session.getScriptTimeZone();
  var d=String(row.date||'').trim(),today=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd');
  if(d>today)throw new Error('Future timesheets are not allowed');
  if(d!==today&&u.role!=='Admin')throw new Error('Timesheets may only be submitted for today');
  var worker=String(row.worker||u.name||u.username||'').trim();
  if(worker.toLowerCase()!==String(u.name||u.username).trim().toLowerCase()&&u.role!=='Admin')throw new Error('You may only submit your own timesheet');
  var c=calc_(d,row.timeIn,row.timeOut,row.lunch);
  if(!c)throw new Error(shiftReviewReason_(d,row.timeIn,row.timeOut,row.lunch));
  var at=findEntry_(worker,d);
  if(at){
    var old=sheet_('Timesheets').getRange(at,1,1,14).getValues()[0];
    if(timeTxt_(old[5])===row.timeIn&&timeTxt_(old[6])===row.timeOut&&Number(old[7])===Number(row.lunch)&&String(old[4]||'')===String(row.job||'')&&String(old[11]||'')===String(row.note||''))return {saved:true,unchanged:true,normalHours:c.normal,overtimeHours:c.overtime,totalHours:c.total};
    if(u.role!=='Admin')throw new Error('This day is already submitted and locked; ask an Admin to correct it');
  }
  var result=writeEntry_(u,Object.assign({},row,{worker:worker,date:d}));
  if(result.skipped)throw new Error(result.reason||'Invalid timesheet');
  if(result.added||result.updated)rebuildWorkerTabs([worker]);
  return {saved:true,unchanged:!!result.unchanged,normalHours:c.normal,overtimeHours:c.overtime,totalHours:c.total};
}
function hiDailyStockReport_(dateText){
  var ss=hiTargetSpreadsheet_(HI_COUNT_SHEET),tz=ss.getSpreadsheetTimeZone()||Session.getScriptTimeZone();
  var date=String(dateText||Utilities.formatDate(new Date(),tz,'yyyy-MM-dd')).trim();
  function sameDay_(v){if(!v)return false;var d=v instanceof Date?v:new Date(v);return !isNaN(d)&&Utilities.formatDate(d,tz,'yyyy-MM-dd')===date;}
  function stamp_(v){var d=v instanceof Date?v:new Date(v);return isNaN(d)?'':Utilities.formatDate(d,tz,'yyyy-MM-dd HH:mm:ss');}
  var counts=[],moves=[],sh=ss.getSheetByName(HI_COUNT_SHEET);
  if(sh&&sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,Math.min(8,sh.getMaxColumns())).getValues().forEach(function(r){if(sameDay_(r[0]))counts.push({timestamp:stamp_(r[0]),user:String(r[1]||''),location:String(r[2]||''),code:String(r[3]||''),description:String(r[4]||''),count:Number(r[5])||0,old:r[6]==null||r[6]===''?null:Number(r[6]),delta:r[7]==null||r[7]===''?null:Number(r[7])});});
  sh=hiTargetSpreadsheet_(HI_MOVE_SHEET).getSheetByName(HI_MOVE_SHEET);
  if(sh&&sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,10).getValues().forEach(function(r){if(sameDay_(r[0]))moves.push({timestamp:stamp_(r[0]),user:String(r[1]||''),type:String(r[2]||''),from:String(r[3]||''),to:String(r[4]||''),code:String(r[5]||''),description:String(r[6]||''),qty:Number(r[7])||0,reason:String(r[8]||''),reference:String(r[9]||'')});});
  return {date:date,counts:counts,movements:moves};
}
function hiServiceGet_(p,body){
  if(p.action!=='hiStock'&&p.action!=='hiStockReport')return null;
  auth_(body);
  if(p.action==='hiStockReport')return out_({ok:true,report:hiDailyStockReport_(p.date||body.date)});
  return out_({ok:true,stock:hiStockRows_(),places:HI_PLACES,categories:['Gas','Plumbing','Geyser','Consumable','Tools','Other']});
}
function hiServicePost_(body){
  var a=body.action;if(['hiStockCount','hiStockAdd','hiStockTransfer','hiStockIssue','hiStockAdjust','hiStockReceive','hiTimesheet'].indexOf(a)<0)return null;
  var u=auth_(body);
  if(a==='hiStockCount'){var r=hiCount_(u,String(body.place||''),body.counts||{});return out_({ok:true,changed:r.changed,unknown:r.unknown,rejected:r.rejected});}
  if(a==='hiStockAdd')return out_({ok:true,added:hiAdd_(u,body.item||{})});
  if(a==='hiStockIssue'){if(typeof permissionCheck_==='function')permissionCheck_(u,{action:'hiStockTransfer'});return out_({ok:true,result:hiMove_(u,body.from,'Kleinmond',body.lines,'issue','Stock issued to Kleinmond',body.reference,body.requestId)});}
  if(a==='hiStockTransfer')return out_({ok:true,result:hiMove_(u,body.from,body.to,body.lines,'transfer',body.reason,'',body.requestId)});
  if(a==='hiStockAdjust')return out_({ok:true,result:hiMove_(u,body.place,'',body.lines,'adjust',body.reason,'',body.requestId)});
  if(a==='hiStockReceive')return out_({ok:true,result:hiMove_(u,'',body.place,body.lines,'receive','Invoice',body.reference,body.requestId)});
  if(a==='hiTimesheet')return out_({ok:true,result:hiTime_(u,body.row||{})});
}
