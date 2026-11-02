/**
 * Hi Service job-card link outbox, derived from the existing 15-minute TimeTree READ.
 *
 * This module deliberately DOES NOT WRITE BACK to TimeTree. Its unofficial
 * event-edit endpoint, payload schema, version handling and permissions must be
 * established by a dedicated, reversible test before any production mutation.
 *
 * Script property HI_SERVICE_APP_URL: absolute HTTPS app origin/base URL.
 * Sheet TimeTreeJobCardLinks: stable per-source-event link + sync state.
 */
var HI_TT_LINKS_='TimeTreeJobCardLinks';
function hiTtJobCardUrl_(event) {
  var base=String(PropertiesService.getScriptProperties().getProperty('HI_SERVICE_APP_URL')||'').trim();
  if(!/^https:\/\/[^\s?#]+$/.test(base))return '';
  base=base.replace(/\/$/,'');
  return base+'/jobcard?source=timetree&booking='+encodeURIComponent(event.id);
}
function hiTtIsHiService_(event) {
  if(event.source!=='timetree'||event.status==='ARCHIVED'||event.targets.indexOf('Hi Service')<0)return false;
  return ttTagVisible_(event,'Hi Service',{role:'Admin',name:'',username:''});
}
function hiTtStageJobCardLinks_(events) {
  var sh=ttSheet_(HI_TT_LINKS_,['Booking ID','Calendar ID','Event ID','Job Card URL','Client','Address','Contact','Last source update','Write status','Last checked']);
  var existing=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,10).getValues():[];
  var lookup={};existing.forEach(function(row,i){if(lookup[String(row[0])])throw Error('Duplicate Hi Service link outbox identity');lookup[String(row[0])]=i;});
  var now=new Date(),staged=0,missingUrl=0;
  events.filter(hiTtIsHiService_).forEach(function(e){
    var url=hiTtJobCardUrl_(e),raw=e.raw||{},contact=String(raw.contact_person||raw.contact||'');
    if(!url){missingUrl++;return;}
    var newRow=[e.id,e.sourceCalendarId,e.sourceEventId,url,e.customer,e.site,contact,e.sourceUpdatedAt,'PENDING_TIMETREE_WRITE',now];
    var pos=lookup[e.id];
    if(pos===undefined){lookup[e.id]=existing.length;existing.push(newRow);staged++;return;}
    var prior=existing[pos],unchanged=prior[3]===url&&Number(prior[7])===Number(e.sourceUpdatedAt)&&prior[4]===e.customer&&prior[5]===e.site&&prior[6]===contact;
    if(unchanged){prior[9]=now;return;}
    // Never silently reapply a stale "written" status after the source changes.
    existing[pos]=newRow;staged++;
  });
  if(existing.length){
    if(sh.getMaxRows()<existing.length+1)sh.insertRowsAfter(sh.getMaxRows(),existing.length+1-sh.getMaxRows());
    sh.getRange(2,1,existing.length,10).setValues(existing);
  }
  return {staged:staged,missingAppUrl:missingUrl,total:existing.length,writeEnabled:false};
}
