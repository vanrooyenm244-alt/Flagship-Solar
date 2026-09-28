/* Timesheet-only durable snapshots. No business-hour calculations live here. */
(function(root){
  'use strict';
  function clone(x){return JSON.parse(JSON.stringify(x));}
  function id(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
  function owner(user,url){return JSON.stringify([String(url||''),String(user||'').trim().toLowerCase()]);}
  function payload(worker,date,r){return {worker:worker,date:date,job:r.job||'',timeIn:r.ti||'',timeOut:r.to||'',lunch:r.lu,note:r.note||''};}
  function validLunch(v){return v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0;}
  function fingerprint(worker,date,r){return JSON.stringify(payload(worker,date,r));}
  function state(s){return s||{cycles:{},queue:[],busy:null};}
  function create(io){
    var running=null;
    function edit(account,fn){return io.change(account,function(s){return fn(state(s));});}
    function read(account){return io.read(account).then(state);}
    function locate(s,q){return s.cycles[q.cycle]&&s.cycles[q.cycle][q.row.worker]&&s.cycles[q.cycle][q.row.worker][q.row.date];}
    function current(s,q){var r=locate(s,q);return r&&r.on&&r.revision===q.revision;}
    function tag(s,q,status,reason){
      q.status=status;q.reason=reason||'';
      if(current(s,q)){var r=locate(s,q);r.syncState=status;r.syncReason=q.reason;r.sent=status==='accepted';}
    }
    function saveCycle(account,cycle,data,expectedVersion){
      var snapshot=clone(data);
      return edit(account,function(s){
        s.versions=s.versions||{};
        if(expectedVersion!==undefined&&expectedVersion!==(s.versions[cycle]||0))throw new Error('This cycle changed in another tab. Keep this draft open and compare before reloading; nothing was overwritten.');
        var old=s.cycles[cycle]||{}, next={};
        Object.keys(snapshot).forEach(function(w){next[w]={};Object.keys(snapshot[w]).forEach(function(d){
          var r=snapshot[w][d], prev=old[w]&&old[w][d];
          if(prev&&prev.revision===r.revision){
            if(fingerprint(w,d,prev)!==fingerprint(w,d,r))throw new Error('Changed Timesheet snapshot must have a new revision.');
            r.syncState=prev.syncState;r.syncReason=prev.syncReason;r.sent=prev.sent;
          }
          else {r.sent=false;r.syncState='draft';r.syncReason='';}
          next[w][d]=r;
        });});
        s.cycles[cycle]=next;
        s.versions[cycle]=(s.versions[cycle]||0)+1;
        s.queue.forEach(function(q){if(q.cycle===cycle&&!current(s,q)&&q.status!=='in-flight')tag(s,q,'rejected','Superseded or removed locally; retained for reference, not replayed.');});
        return s;
      });
    }
    // Server read-back is not acknowledgement of a local submission.
    function importServer(account,cycle,entries,expectedVersion){
      var snapshot=clone(entries);
      return edit(account,function(s){
        if(io.currentOwner()!==account)return s;
        s.versions=s.versions||{};
        if((s.versions[cycle]||0)!==expectedVersion)return s;
        var rows=s.cycles[cycle]||(s.cycles[cycle]={}),changed=false;
        Object.keys(snapshot).forEach(function(w){
          if(['__proto__','constructor','prototype'].indexOf(w)>=0)return;
          Object.keys(snapshot[w]||{}).forEach(function(d){
            if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return;
            var date=new Date(d+'T00:00:00Z');
            if(isNaN(date.getTime())||date.toISOString().slice(0,10)!==d)return;
            var month=date.getUTCMonth()+1,year=date.getUTCFullYear();
            if(date.getUTCDate()>=25){month++;if(month===13){month=1;year++;}}
            if('ts-'+year+'-'+String(month).padStart(2,'0')!==cycle)return;
            if(rows[w]&&rows[w][d]||s.queue.some(function(q){return q.cycle===cycle&&q.row.worker===w&&q.row.date===d;}))return;
            var incoming=snapshot[w][d];if(!incoming||typeof incoming!=='object'||!incoming.on)return;
            var r={on:true,ti:String(incoming.ti||''),to:String(incoming.to||''),lu:incoming.lu,job:String(incoming.job||''),note:String(incoming.note||''),revision:id(),sent:false,syncState:'recorded',syncReason:'Read from Sheet; not a local submission acknowledgement.'};
            r._fingerprint=fingerprint(w,d,r);(rows[w]||(rows[w]={}))[d]=r;changed=true;
          });
        });
        if(changed)s.versions[cycle]=(s.versions[cycle]||0)+1;
        return s;
      });
    }
    function enqueue(account,cycle,rows){
      return edit(account,function(s){
        rows.forEach(function(x){
          var r=s.cycles[cycle]&&s.cycles[cycle][x.worker]&&s.cycles[cycle][x.worker][x.date];
          if(!r||!r.on||r.revision!==x.revision)throw new Error('Draft changed; review and send the current revision.');
          if(!validLunch(r.lu))throw new Error('Enter explicit lunch minutes for '+x.worker+' '+x.date+' (0 is valid).');
          if(r.syncState==='accepted'||r.syncState==='recorded')return;
          var q=s.queue.find(function(v){return v.cycle===cycle&&v.revision===r.revision&&v.row.worker===x.worker&&v.row.date===x.date;});
          if(q&&q.status==='in-flight')return;
          if(!q){q={id:id(),cycle:cycle,revision:r.revision,row:payload(x.worker,x.date,r)};q.row.lunch=Number(r.lu);s.queue.push(q);}
          tag(s,q,'queued','');
        });return s;
      });
    }
    function drain(account,identity){
      if(running)return running;
      var operation=async function(){
        if(io.currentOwner()!==account)return;
        if(!io.online())return;
        var batch=[],token=id();
        await edit(account,function(s){
          if(s.busy)return s;
          s.queue.forEach(function(q){
            if(q.status!=='queued')return;
            if(!current(s,q)){tag(s,q,'rejected','Superseded or removed locally; not replayed.');return;}
            tag(s,q,'in-flight','Awaiting row acknowledgement.');batch.push(clone(q));
          });
          if(batch.length)s.busy=token;
          return s;
        });
        if(!batch.length)return;
        if(io.notify)io.notify();
        var response,error;
        try{
          if(io.currentOwner()!==account)throw new Error('Account or connection changed before sending. Review and retry under the original account.');
          response=await io.send(identity,batch.map(function(q){return clone(q.row);}));
          if(!response||response.ok!==true)throw new Error(response&&response.error||'Server did not confirm the request.');
        }catch(e){error=String(e.message||e);}
        await edit(account,function(s){
          if(s.busy!==token)throw new Error('Submission ownership changed; acknowledgement held for review.');
          var accepted={};
          batch.forEach(function(snapshot,index){
            var q=s.queue.find(function(v){return v.id===snapshot.id;});if(!q)return;
            if(error){tag(s,q,'failed',error);return;}
            var matches=(Array.isArray(response.results)?response.results:[]).filter(function(r){return r.index===index;});
            var result=matches.length===1?matches[0]:null;
            if(!result||result.date!==q.row.date||result.worker!==q.row.worker){tag(s,q,'failed','Missing or mismatched row acknowledgement; outcome unconfirmed.');return;}
            if(['added','updated','unchanged'].indexOf(result.status)>=0){
              tag(s,q,'accepted','');accepted[q.id]=true;
            }else{
              tag(s,q,'rejected',String(result.reason||result.error||result.message||({blocked:'Not authorized to submit this worker.',closed:'Pay cycle is closed.',skipped:'Server skipped this row; check its values.'}[result.status])||('Unrecognized row status: '+result.status)));
            }
          });
          s.queue=s.queue.filter(function(q){return !accepted[q.id];});s.busy=null;return s;
        });
        if(io.notify)io.notify();
      };
      running=Promise.resolve().then(operation).finally(function(){running=null;});return running;
    }
    // Explicit recovery is allowed only while holding an origin-wide Web Lock.
    // Caller must never use this to steal a live drain's lock.
    function recover(account){return edit(account,function(s){
      if(s.busy){s.queue.forEach(function(q){if(q.status==='in-flight')tag(s,q,'failed','Interrupted submission; outcome unknown. Review Sheet before retrying.');});s.busy=null;}
      return s;
    });}
    return {read:read,importServer:importServer,saveCycle:saveCycle,enqueue:enqueue,drain:drain,recover:recover};
  }
  var api={create:create,owner:owner,payload:payload,validLunch:validLunch,fingerprint:fingerprint,id:id};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FlagshipTimesheetSync=api;
})(typeof window==='undefined'?globalThis:window);
