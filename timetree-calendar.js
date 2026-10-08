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
  root.TimeTreeCalendar.layout=function(items,month,mode,attr,selectedDay){
    var first=new Date(month.getFullYear(),month.getMonth(),1),start=new Date(first);start.setDate(1-first.getDay());var end=new Date(start);end.setDate(end.getDate()+41);
    var from=mode==='day'?selectedDay:mode==='agenda'?key(first):key(start),to=mode==='day'?selectedDay:mode==='agenda'?key(new Date(month.getFullYear(),month.getMonth()+1,0)):key(end);
    var view=root.TimeTreeCalendar.entries(items,from,to),groups={};view.events.forEach(function(e){(groups[e.displayDate]||(groups[e.displayDate]=[])).push(e);});
    function booking(e){var link=e.source==='timetree'&&/^https:\/\/timetreeapp\.com\/calendars\/[A-Za-z0-9_-]+\/events\/[A-Za-z0-9_-]+$/.test(e.sourceUrl||'')?'<a class="cal-timetree" href="'+esc(e.sourceUrl)+'" target="_blank" rel="noopener noreferrer">Open in TimeTree ↗</a>':'';return '<div class="cal-booking"><button type="button" class="cal-event" '+attr+'="'+esc(e.id)+'"><small>'+esc(e.startTime||'All day')+(e.endTime?' – '+esc(e.endTime):'')+'</small><strong>'+esc(e.customer||'Booking')+'</strong><small>'+esc([e.jobType,e.technician,e.site].filter(Boolean).join(' · '))+'</small></button>'+link+'</div>';}
    var html='';
    if(mode==='agenda'||mode==='day'){
      Object.keys(groups).sort().forEach(function(date){var d=new Date(date+'T12:00:00');html+='<div class="cal-agenda-day"><button type="button" class="cal-date" data-cal-day="'+date+'" aria-label="Open '+date+'">'+formatter.format(d)+'<b>'+d.getDate()+'</b></button><div>'+groups[date].map(booking).join('')+'</div></div>';});
      html='<div class="cal-agenda">'+(html||'<div class="cal-empty">No bookings '+(mode==='day'?'on this day':'this month')+'.</div>')+'</div>';
    }else{
      html='<div class="cal-grid">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(function(d){return '<b class="cal-weekday">'+d+'</b>';}).join('');
      for(var i=0;i<42;i++){var d=new Date(start);d.setDate(start.getDate()+i);var date=key(d);html+='<div class="cal-day'+(d.getMonth()!==month.getMonth()?' outside':'')+(date===key(new Date())?' today':'')+'"><button type="button" class="cal-number" data-cal-day="'+date+'" aria-label="Open '+date+'">'+d.getDate()+'</button>'+(groups[date]||[]).map(booking).join('')+'</div>';}
      html+='</div>';
    }
    return {html:html,errors:view.errors};
  };
})(typeof window!=='undefined'?window:globalThis);

(function(root){

function ttTagKey_(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s*([/\-])\s*/g,'$1').replace(/\s+/g,' ');}
function ttEventTags_(e){return (Array.isArray(e.tags)&&e.tags.length?e.tags:[e.jobType||'']).map(function(t){return ttTagKey_(typeof t==='object'?t.name:t);});}
function ttTagVisible_(e,company,user){
  if(e.source!=='timetree')return true;
  var tags=ttEventTags_(e),flag=['flagship electric','jacobus'],hi=['allaistair-kai','allistair-kai','andre','freddie/andre'];
  var allowed=company==='Flagship Solar'?flag:company==='Hi Service'?hi:[];
  var matches=tags.filter(function(t){return allowed.indexOf(t)>=0;});if(!matches.length)return false;
  if(!user||user.role==='Admin'||(company==='Hi Service'&&user.role!=='Worker'))return true;
  var names=[user.name,user.username].map(ttTagKey_).map(function(n){return n.split(/\s+/)[0];});
  if(company==='Flagship Solar')return matches.some(function(t){return t==='flagship electric'?names.some(function(n){return ['jacobus','frank','ian','sangwani','sangwannyasulu','michael'].indexOf(n)>=0;}):names.indexOf(t)>=0;});
  return matches.some(function(t){return t.split(/[/\-]/).some(function(n){return names.indexOf(n)>=0||(n==='kai'&&names.indexOf('kia')>=0)||(n==='allaistair'&&names.indexOf('allistair')>=0);});});
}
root.TimeTreeCalendar.visible=ttTagVisible_;root.TimeTreeCalendar.tagKey=ttTagKey_;
})(typeof window!=='undefined'?window:globalThis);
