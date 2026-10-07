(function(root){
  'use strict';
  var formatters={};
  function parts(ms,tz){var f=formatters[tz]||(formatters[tz]=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));var p=Object.fromEntries(f.formatToParts(new Date(ms)).map(function(x){return [x.type,x.value];}));return {date:p.year+'-'+p.month+'-'+p.day,stamp:p.year+p.month+p.day+'T'+p.hour+p.minute+p.second};}
  function days(e,start,end,from,to,out){var tz=e.allDay?'UTC':e.timeZone||'Africa/Johannesburg',a=parts(start,tz).date,b=parts(end,tz).date;var date=a<from?from:a;while(date<=b&&date<=to){if(date>=from)out.push(Object.assign({},e,{displayDate:date,occurrenceStart:start}));date=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);}}
  function entries(items,from,to){
    var out=[],errors=[],lo=Date.parse(from+'T00:00:00Z')-86400000,hi=Date.parse(to+'T23:59:59Z')+86400000;
    var overrides=new Set(items.filter(function(e){return e.recurringUuid;}).map(function(e){return e.sourceCalendarId+':'+e.recurringUuid+':'+e.date;}));
    items.forEach(function(e){
      if(e.status==='ARCHIVED')return;
      if(e.source!=='timetree'){if(e.date>=from&&e.date<=to)out.push(Object.assign({},e,{displayDate:e.date}));return;}
      if(!e.recurrences.length){days(e,e.startAt,e.endAt,from,to,out);return;}
      try{
        if(!root.rrule)throw Error('Recurrence library unavailable');
        var tz=e.allDay?'UTC':e.timeZone||'Africa/Johannesburg',stamp=parts(e.startAt,tz).stamp;
        var dt='DTSTART'+(tz==='UTC'?':'+stamp+'Z':';TZID='+tz+':'+stamp);
        var rule=root.rrule.rrulestr(dt+'\n'+e.recurrences.join('\n'),{forceset:true});
        var duration=Math.max(0,e.endAt-e.startAt);
        rule.between(new Date(lo-duration),new Date(hi),true).forEach(function(d){var key=parts(d.getTime(),tz).date;if(!overrides.has(e.sourceCalendarId+':'+e.sourceEventId+':'+key))days(e,d.getTime(),d.getTime()+duration,from,to,out);});
      }catch(err){errors.push(e.customer+': '+err.message);days(e,e.startAt,e.endAt,from,to,out);}
    });
    return {events:out.sort(function(a,b){return (a.displayDate+(a.startTime||'')).localeCompare(b.displayDate+(b.startTime||''));}),errors:errors};
  }
  function details(e){return [e.customer,e.date+(e.endDate&&e.endDate!==e.date?' – '+e.endDate:''),(e.startTime||'All day')+(e.endTime?' – '+e.endTime:''),e.site,e.technician,e.calendarName,e.jobType,e.notes,e.recurrences&&e.recurrences.length?'Repeating booking: '+e.recurrences.join('; '):''].filter(Boolean).join('\n\n');}
  root.TimeTreeCalendar={entries:entries,details:details};
  if(typeof module!=='undefined')module.exports=root.TimeTreeCalendar;
})(typeof window!=='undefined'?window:globalThis);

(function(root){
  var formatter=new Intl.DateTimeFormat('en-GB',{weekday:'short'});
  function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function key(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  root.TimeTreeCalendar.layout=function(items,month,mode,attr){
    var first=new Date(month.getFullYear(),month.getMonth(),1),start=new Date(first);start.setDate(1-first.getDay());var end=new Date(start);end.setDate(end.getDate()+41);
    var from=mode==='agenda'?key(first):key(start),to=mode==='agenda'?key(new Date(month.getFullYear(),month.getMonth()+1,0)):key(end);
    var view=root.TimeTreeCalendar.entries(items,from,to),groups={};view.events.forEach(function(e){(groups[e.displayDate]||(groups[e.displayDate]=[])).push(e);});
    function booking(e){return '<button type="button" class="cal-event" '+attr+'="'+esc(e.id)+'"><small>'+esc(e.startTime||'All day')+(e.endTime?' – '+esc(e.endTime):'')+'</small><strong>'+esc(e.customer||'Booking')+'</strong><small>'+esc([e.technician,e.site].filter(Boolean).join(' · '))+'</small></button>';}
    var html='';
    if(mode==='agenda'){
      Object.keys(groups).sort().forEach(function(date){var d=new Date(date+'T12:00:00');html+='<div class="cal-agenda-day"><div class="cal-date">'+formatter.format(d)+'<b>'+d.getDate()+'</b></div><div>'+groups[date].map(booking).join('')+'</div></div>';});
      html='<div class="cal-agenda">'+(html||'<div class="cal-empty">No bookings this month.</div>')+'</div>';
    }else{
      html='<div class="cal-grid">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(function(d){return '<b class="cal-weekday">'+d+'</b>';}).join('');
      for(var i=0;i<42;i++){var d=new Date(start);d.setDate(start.getDate()+i);var date=key(d);html+='<div class="cal-day'+(d.getMonth()!==month.getMonth()?' outside':'')+(date===key(new Date())?' today':'')+'"><b class="cal-number">'+d.getDate()+'</b>'+(groups[date]||[]).map(booking).join('')+'</div>';}
      html+='</div>';
    }
    return {html:html,errors:view.errors};
  };
})(typeof window!=='undefined'?window:globalThis);
