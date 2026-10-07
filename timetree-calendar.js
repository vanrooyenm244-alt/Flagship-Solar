(function(root){
  'use strict';
  function parts(ms,tz){var p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).map(function(x){return [x.type,x.value];}));return {date:p.year+'-'+p.month+'-'+p.day,stamp:p.year+p.month+p.day+'T'+p.hour+p.minute+p.second};}
  function days(e,start,end,from,to,out){var tz=e.allDay?'UTC':e.timeZone||'Africa/Johannesburg',a=parts(start,tz).date,b=parts(end,tz).date;var date=a;while(date<=b&&date<=to){if(date>=from)out.push(Object.assign({},e,{displayDate:date,occurrenceStart:start}));date=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);}}
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
