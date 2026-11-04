/* Only the job number and company travel in the link; details require app sign-in. */
(function(root){
  'use strict';
  var adapter,busy=false,filling=false,handled='',owner='';
  function pending(){
    var p=new URLSearchParams(root.location.search);if(!p.has('book-job'))p=new URLSearchParams(root.location.hash.slice(1));
    if(!p.has('book-job'))return null;
    return {jobNo:p.get('book-job'),company:p.get('company')};
  }
  function linkKey(){return JSON.stringify(pending());}
  function clear(){
    if(filling)return;
    if(pending()){var p=new URLSearchParams(root.location.search);p.delete('book-job');p.delete('company');var search=p.toString();var hash=/^#book-job=/.test(root.location.hash)?'':root.location.hash;root.history.replaceState(root.history.state,'',root.location.pathname+(search?'?'+search:'')+hash);}
    handled='';if(adapter)adapter.status('');
  }
  async function open(){
    if(!adapter)return;
    var link=pending(),who=adapter.identity();
    if(!link||!who||busy)return;
    var key=linkKey()+'|'+who;if(key===handled)return;
    handled=key;owner=who;
    adapter.calendar();
    if(link.company!==adapter.company){adapter.status('This link belongs to the other company. Open its current link on the Quote Job List.');return;}
    if(!/^[0-9]{1,12}$/.test(link.jobNo||'')){adapter.status('Invalid job number in this booking link.');return;}
    if(!adapter.allowed()){handled='';adapter.status('You need calendar view and scheduling permission to book this site visit.');return;}
    busy=true;adapter.status('Loading job '+link.jobNo+' from Quote Job List…');
    try{
      var result=await adapter.read(link.jobNo);
      if(owner!==adapter.identity()||key!==linkKey()+'|'+adapter.identity())return;
      if(!result||result.ok===false||!result.job||String(result.job.jobNo)!==link.jobNo)throw Error(result&&result.error||'Invalid job response');
      filling=true;try{adapter.fill(result.job,result.booking||null);}finally{filling=false;}handled=key;
      adapter.status(result.booking?'Site visit already booked. You can change its date, time or assigned staff.':'Choose the site visit date, time and assigned staff, then Save job.');
    }catch(error){
      if(owner===adapter.identity())adapter.status('Could not load job: '+String(error.message||error),function(){handled='';open();});
    }finally{busy=false;if(pending()&&(owner!==adapter.identity()||key!==linkKey()+'|'+adapter.identity()))open();}
  }
  root.QuoteJobCalendar={init:function(config){adapter=config;open();},open:open,clear:clear};
  root.addEventListener('hashchange',open);
  root.addEventListener('app-session-ready',open);
  root.addEventListener('load',open);
})(window);
