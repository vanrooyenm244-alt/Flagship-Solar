'use strict';
// Read-only TimeTree web interface. It is unofficial; fail closed on schema changes.
const {randomUUID}=require('node:crypto');
const BASE='https://timetreeapp.com/api/v1';
class TimeTreeClient {
  constructor({email,password,fetchImpl=fetch,delayMs=350}) {Object.assign(this,{email,password,fetchImpl,delayMs});this.cookie='';}
  async request(path,method='GET',body) {
    if(!path.startsWith('/'))throw Error('Invalid TimeTree path');
    const r=await this.fetchImpl(BASE+path,{method,redirect:'error',signal:AbortSignal.timeout(45000),headers:{'Content-Type':'application/json','X-Timetreea':'web/2.1.0/en',...(this.cookie?{Cookie:this.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!r.ok)throw Error('TimeTree HTTP '+r.status+'; existing records retained');
    if(method==='PUT')this.cookie=r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
    return r.json();
  }
  async login(){if(!this.email||!this.password)throw Error('TimeTree credentials missing');await this.request('/auth/email/signin','PUT',{uid:this.email,password:this.password,uuid:randomUUID().replaceAll('-','')});if(!this.cookie)throw Error('TimeTree did not issue a session');}
  async calendars(){const j=await this.request('/calendars?since=0');if(!Array.isArray(j.calendars))throw Error('Unexpected TimeTree calendar response');return j.calendars;}
  async pages(path,key) {
    const pages=[],seen=new Set();let cursor;
    for(let n=0;n<10000;n++){
      const j=await this.request(path+(cursor===undefined?'':'?since='+encodeURIComponent(cursor)));
      if(!Array.isArray(j[key])||typeof j.chunk!=='boolean')throw Error('Unexpected TimeTree pagination; no import performed');
      pages.push(j);
      if(!j.chunk)return pages;
      if(j.since===undefined||seen.has(String(j.since)))throw Error('TimeTree pagination stopped advancing');
      seen.add(String(j.since));cursor=j.since;await new Promise(r=>setTimeout(r,this.delayMs));
    }
    throw Error('TimeTree pagination limit reached; no import performed');
  }
  events(id){return this.pages('/calendar/'+encodeURIComponent(id)+'/events/sync','events');}
  activities(id,uuid){return this.pages('/calendar/'+encodeURIComponent(id)+'/event/'+encodeURIComponent(uuid)+'/activities','activities');}
}
module.exports={TimeTreeClient};
