/** Shared read-only TimeTree mirror. Deploy with Code.gs, Stock.gs and HiService.gs.
 * Never changes TimeTree, legacy Calendar, job cards, stock, or timesheets.
 * Source rows disappear only from views on an explicit archived source record.
 */
var TT_EVENTS_='TimeTreeEvents',TT_HISTORY_='TimeTreeHistory';
function ttSheet_(name,headers){
  var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName(name)||ss.insertSheet(name);
  if(sh.getMaxColumns()<headers.length)sh.insertColumnsAfter(sh.getMaxColumns(),headers.length-sh.getMaxColumns());
  if(!sh.getLastRow())sh.appendRow(headers);
  var actual=sh.getRange(1,1,1,headers.length).getValues()[0];
  if(headers.some(function(h,i){return String(actual[i])!==h;}))throw Error('Unexpected '+name+' schema; no data overwritten');
  return sh;
}
function ttDigest_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8).map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');}
function ttAuthorizeConnector_(body){
  var expected=PropertiesService.getScriptProperties().getProperty('TIMETREE_CONNECTOR_TOKEN_SHA256');
  if(!expected||!body.connectorToken||ttDigest_(body.connectorToken)!==expected)throw Error('Invalid or unconfigured connector token');
}
function ttValidate_(e,allowed){
  if(!e||e.source!=='timetree'||!/^\d+$/.test(String(e.sourceCalendarId))||!e.sourceEventId||e.id!=='tt:'+e.sourceCalendarId+':'+e.sourceEventId)throw Error('Invalid source identity');
  if(allowed.indexOf(String(e.sourceCalendarId))<0)throw Error('Calendar is not approved for import');
  if(!Array.isArray(e.targets)||!e.targets.length||e.targets.some(function(t){return ['Flagship Solar','Hi Service'].indexOf(t)<0;}))throw Error('Invalid calendar targets');
  if(!/^https:\/\/timetreeapp\.com\/calendars\/[A-Za-z0-9_-]+\/events\/[A-Za-z0-9_-]+$/.test(String(e.sourceUrl||'')))throw Error('Invalid TimeTree booking link');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!/^\d{4}-\d{2}-\d{2}$/.test(e.endDate)||!isFinite(e.startAt)||!isFinite(e.endAt)||Number(e.endAt)<Number(e.startAt)||!isFinite(e.sourceUpdatedAt))throw Error('Invalid booking dates');
  if(['SCHEDULED','ARCHIVED'].indexOf(e.status)<0||!Array.isArray(e.recurrences)||!e.raw||String(e.raw.uuid)!==String(e.sourceEventId)||String(e.raw.calendar_id)!==String(e.sourceCalendarId))throw Error('Invalid source record');
  var json=JSON.stringify(e);if(json.length>44000)throw Error('Source record exceeds cell limit; retained archive requires review');return json;
}
function timeTreeImport_(body){
  ttAuthorizeConnector_(body);
  if(!Array.isArray(body.events)||!body.events.length||body.events.length>20)throw Error('Import must contain 1–20 bookings');
  return timeTreeApply_(body.events,String(body.requestId||''));
}
function ttAppendRows_(sh,rows){if(!rows.length)return;var at=sh.getLastRow()+1;if(typeof sh.getMaxRows==='function'&&sh.getMaxRows()<at+rows.length-1)sh.insertRowsAfter(sh.getMaxRows(),at+rows.length-1-sh.getMaxRows());sh.getRange(at,1,rows.length,rows[0].length).setValues(rows);}
function timeTreeApply_(events,requestId){
  var props=PropertiesService.getScriptProperties(),allowed=(props.getProperty('TIMETREE_ALLOWED_CALENDAR_IDS')||'63108444,96534365').split(',').map(function(x){return x.trim();}),seen={};
  // Preflight the complete batch before opening or writing any sheets.
  var plan=events.map(function(e){var json=ttValidate_(e,allowed);if(seen[e.id])throw Error('Duplicate source identity in batch');seen[e.id]=true;return {e:e,json:json,digest:ttDigest_(json)};});
  var sh=ttSheet_(TT_EVENTS_,['ID','Source updated ms','Digest','Data JSON','Mirrored at']),history=ttSheet_(TT_HISTORY_,['Recorded at','ID','Source updated ms','Digest','Data JSON','Request ID']);
  var rows=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,5).getValues():[],index={};
  rows.forEach(function(r,i){if(index[r[0]])throw Error('Duplicate mirror row; no records overwritten');index[r[0]]={row:i+2,values:r};});
  var accepted=[],changed=0,now=new Date(),revisions=[];
  plan.forEach(function(p){var old=index[p.e.id];if(old&&(Number(old.values[1])>Number(p.e.sourceUpdatedAt)||old.values[2]===p.digest)){accepted.push(p.e.id);return;}
    // Write the full new revision first. Retrying a failed write cannot lose its history.
    // The prior revision already exists in append-only history from its initial import.
    revisions.push([now,p.e.id,p.e.sourceUpdatedAt,p.digest,p.json,requestId]);
    var data=[p.e.id,p.e.sourceUpdatedAt,p.digest,p.json,now];
    if(old)rows[old.row-2]=data;else rows.push(data);
    accepted.push(p.e.id);changed++;
  });
  ttAppendRows_(history,revisions);
  // Dedicated mirror table only; keep every existing row, including unseen bookings.
  if(changed){if(typeof sh.getMaxRows==='function'&&sh.getMaxRows()<rows.length+1)sh.insertRowsAfter(sh.getMaxRows(),rows.length+1-sh.getMaxRows());sh.getRange(2,1,rows.length,5).setValues(rows);}
  props.setProperty('TIMETREE_LAST_IMPORT_AT',now.toISOString());
  return {ok:true,acceptedIds:accepted,changed:changed};
}
function timeTreeList_(u,company){
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TT_EVENTS_),events=[];
  if(sh&&sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,5).getValues().forEach(function(r){
    var e=JSON.parse(r[3]);if(e.targets.indexOf(company)<0)return;
    if(u.role==='Worker'&&!jobCardAssigned_(e.technician,u.name))return;
    // Raw source remains protected in the archive/history; return only view fields.
    delete e.raw;e.updatedAt=r[4] instanceof Date?r[4].getTime():Number(r[4])||0;events.push(e);
  });
  return {ok:true,events:events,lastImportAt:PropertiesService.getScriptProperties().getProperty('TIMETREE_LAST_IMPORT_AT')||null};
}
function hiCalendar_(body){var u=auth_(body,['Admin','Technician','Worker']);return timeTreeList_(u,'Hi Service');}
