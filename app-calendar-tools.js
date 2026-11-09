/* Calendar actions shared by both phone apps. No credentials are stored here. */
(function(root){
 'use strict';
 var bridge=root.FlagshipCalendarBridge||root.HiServiceCalendarBridge;if(!bridge)return;
 var host=document.getElementById(bridge.host);if(!host)return;
 var selectedDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 var toolbar=document.createElement('div');toolbar.className='cal-toolbar';
 var add=document.createElement('button');add.type='button';add.textContent='+ Book selected day';add.className='btn';
 var check=document.createElement('button');check.type='button';check.className='btn';check.textContent='Check Google Calendar';
 var link=document.createElement('a');link.href='https://calendar.google.com/calendar?authuser=mjflagship%40gmail.com';link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open Google Calendar ↗';
 toolbar.append(add,check,link);host.append(toolbar);
 var status=document.createElement('p');status.setAttribute('role','status');host.append(status);
 var detail=document.createElement('section');detail.className='cal-details';detail.hidden=true;
 var title=document.createElement('h3'),text=document.createElement('pre');text.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:inherit';
 var actions=document.createElement('div');actions.className='cal-toolbar';detail.append(title,text,actions);host.append(detail);
 host.addEventListener('click',function(event){var day=event.target.closest&&event.target.closest('[data-cal-day]');if(day)selectedDay=day.getAttribute('data-cal-day');});
 add.onclick=function(){if(bridge.allowed())bridge.newOnDay(selectedDay);};
 check.onclick=async function(){check.disabled=true;status.textContent='Checking Google Calendar…';try{var r=await bridge.read({action:'googleCalendarStatus',company:bridge.company});if(r.ok===false)throw Error(r.error||'Connection failed');status.textContent='Connected to '+r.calendarId+' · '+(r.name||'Google Calendar');}catch(e){status.textContent=String(e.message||e);}finally{check.disabled=false;}};
 function button(label,action){var b=document.createElement('button');b.type='button';b.className='btn';b.textContent=label;b.onclick=action;actions.append(b);return b;}
 root.AppCalendarTools={open:function(event){
   detail.hidden=false;title.textContent=event.customer||event.title||'Booking';text.textContent=TimeTreeCalendar.details(event);actions.replaceChildren();
   if(event.googleEventId&&bridge.allowed()){
     button(event.seriesAppId&&event.id.indexOf('gcal:')===0?'Edit this occurrence':'Edit booking',function(){detail.hidden=true;bridge.edit(event);});
     button('Cancel booking',async function(){
       if(!confirm('Cancel '+(event.customer||'this booking')+' in Google Calendar?'))return;
       var b=this;b.disabled=true;status.textContent='Cancelling booking…';
       try{var r=await bridge.request({action:bridge.company==='Hi Service'?'hiCalendarCancel':'calendarCancel',company:bridge.company,eventId:event.id,googleEventId:event.googleEventId,googleEtag:event.googleEtag});if(r.ok===false)throw Error(r.error||'Not cancelled');detail.hidden=true;await bridge.refresh();status.textContent='Booking cancelled in Google Calendar.';}
       catch(e){status.textContent=String(e.message||e);}finally{b.disabled=false;}
     });
   }
   if(bridge.openCard)button('Create / Open Job Card',function(){bridge.openCard(event);});
   if(/^https:\/\/(?:www\.)?(?:google\.com|calendar\.google\.com|timetreeapp\.com)\//.test(event.sourceUrl||'')){
     var source=document.createElement('a');source.href=event.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';source.textContent=event.source==='google'?'Open in Google Calendar ↗':'Open original TimeTree booking ↗';actions.append(source);
   }
   button('Close',function(){detail.hidden=true;});detail.scrollIntoView({behavior:'smooth',block:'nearest'});
 }};
 document.addEventListener('visibilitychange',function(){if(!document.hidden&&!host.classList.contains('hidden')&&(host.id!=='calendar'||host.classList.contains('on')))bridge.refresh();});
 var style=document.createElement('style');style.textContent='.schedule .cal-flagship{--cal-accent:#1766b0;--cal-soft:#eaf2ff}.schedule .cal-hi{--cal-accent:#108344;--cal-soft:#edf8f0}.schedule .cal-grid{align-items:stretch}.schedule .cal-day{overflow:hidden}.schedule .cal-grid .cal-booking{margin-bottom:3px}.schedule .cal-grid .cal-event strong{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.25}.schedule .cal-toolbar button{min-height:40px}.schedule .cal-details[hidden]{display:none}.schedule .cal-details{color:#172b22}.schedule .cal-details .btn{margin:4px}@media(max-width:600px){.schedule .cal-grid .cal-event{padding:4px 2px}.schedule .cal-grid .cal-event strong{font-size:10px}.schedule .cal-grid{gap:2px}}';document.head.append(style);
})(window);
