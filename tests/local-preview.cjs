/* Local-only UI smoke fixture. Never proxies requests to Google or Supabase. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const user={username:'sc1test',name:'SC1 Test',role:'Admin'};
const cards=new Map();
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:8766');
 if(url.pathname==='/exec'){
  let b=Object.fromEntries(url.searchParams);if(req.method==='POST'){let text='';for await(const part of req)text+=part;b=JSON.parse(text);}
  let result={ok:true};
  if(['login','me'].includes(b.action))result.user=user;
  else if(b.action==='workers')result.workers=['SC1 Test'];
  else if(b.action==='timesheetAll')Object.assign(result,{cycle:b.cycle,entries:{}});
  else if(b.action==='timesheets')result.results=b.rows.map((r,index)=>({index,date:r.date,worker:r.worker,status:r.note==='REJECT'?'skipped':'added',reason:r.note==='REJECT'?'Staging fixture rejection':undefined}));
  else if(b.action==='xeroStatus')result.xero={configured:false,connected:false};
  else if(b.action==='jobCardSave'){cards.set(b.jobCard.id,b.jobCard);Object.assign(result,{id:b.jobCard.id,status:b.jobCard.status});}
  else if(b.action==='jobCards')result.jobCards=[...cards.values()].map(data=>({id:data.id,data}));
  else if(b.action==='prices')result.prices=[];
  else result={ok:false,error:'Local fixture does not implement '+String(b.action)+'. No external request was made.'};
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify(result));
 }
 if(url.pathname==='/supabase-config.js'){res.setHeader('Content-Type','application/javascript');return res.end('/* no Supabase in local fixture */');}
 const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()||!(/\.(html|js|png|jpg|webmanifest)$/.test(file))){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':file.endsWith('.webmanifest')?'application/manifest+json':file.endsWith('.png')?'image/png':'image/jpeg');fs.createReadStream(file).pipe(res);
}).listen(8766,'127.0.0.1',()=>console.log('Local-only fixture: http://127.0.0.1:8766 ; use sc1test and a dummy password; endpoint http://127.0.0.1:8766/exec'));
