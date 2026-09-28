// Separate frontend origin for REAL staging. No simulated successful API replies.
// Private production configuration and non-runtime repository files are not served.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const STAGING_ENDPOINT='https://script.google.com/macros/s/AKfycbwMhq4WHNdmAZjeik7k0BMBoEykCfiKWb2EOfCTM3YvL8CG4iNKMyAJELa7keI58Nrb/exec';
const STAGING_SHEET='1HNpkEoRIWiovuVC6sYydTmXwBHHOh8aRYs6YVG8hfFs';
function stagingCode(){
 const guard=`\n// Generated STAGING-ONLY boundary. Never copy this variant to production.\nfunction rcStagingBoundary_(action){\n if(SpreadsheetApp.getActiveSpreadsheet().getId()!==${JSON.stringify(STAGING_SHEET)})throw new Error('Staging Sheet identity mismatch.');\n var keys=Object.keys(PropertiesService.getScriptProperties().getProperties());\n if(keys.some(function(k){return /^(XERO_|SUPABASE_)/.test(k);}))throw new Error('External service credentials must be absent in isolated staging.');\n if(/^xero/i.test(String(action||''))&&action!=='xeroStatus'||action==='proposalSendToXero')throw new Error('Xero operations disabled in isolated staging.');\n}\n`;
 let code=fs.readFileSync(path.join(root,'apps-script/Code.gs'),'utf8');
 for(const signature of ['function doGet(e) {','function doPost(e) {'])if(!code.includes(signature))throw Error('Backend entry point changed; review staging boundary.');
 code=code.replace('function doGet(e) {',"function doGet(e) {\n  rcStagingBoundary_(e&&e.parameter&&e.parameter.action);");
 code=code.replace('function doPost(e) {',"function doPost(e) {\n  var stagingAction;try{stagingAction=JSON.parse(e.postData.contents).action;}catch(ignore){}\n  rcStagingBoundary_(stagingAction);");
 return code+guard;
}
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const shell=vm.runInNewContext(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1]);
const allowed=new Set(shell.filter(p=>p!=='./').map(p=>'/'+p.replace(/^\.\//,'')));
allowed.add('/sw.js');
const sources=new Map([['/__source/Code.gs','apps-script/Code.gs'],['/__source/Stock.gs','apps-script/Stock.gs']]);
function createServer(){return http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:8767');
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 res.setHeader('Cache-Control','no-store');
 // The initial API destination is pinned; Apps Script responses redirect to googleusercontent.
 res.setHeader('Content-Security-Policy',"connect-src 'self' "+STAGING_ENDPOINT+" https://script.googleusercontent.com; object-src 'none'; base-uri 'self'");
 if(['/backend-source.html','/staging-checks.html','/stock-source.html'].includes(url.pathname)){
  res.setHeader('Content-Type','text/html; charset=utf-8');
  const selected=url.pathname==='/staging-checks.html'?'tests/staging-checks.gs':url.pathname==='/stock-source.html'?'apps-script/Stock.gs':'apps-script/Code.gs';
  const code=(selected==='apps-script/Code.gs'?stagingCode():fs.readFileSync(path.join(root,selected),'utf8')).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return res.end('<!doctype html><title>Staging backend source</title><pre id="source">'+code+'</pre>');
 }
 if(url.pathname==='/supabase-config.js'){res.setHeader('Content-Type','application/javascript');return res.end('window.FLAGSHIP_SUPABASE_CONFIG = {}; // Production Supabase deliberately disconnected in staging.');}
 const source=sources.get(url.pathname),name=url.pathname==='/'?'/index.html':url.pathname;
 if(!source&&!allowed.has(name)){res.writeHead(404);return res.end('Not a staging runtime asset.');}
 const file=path.join(root,source||name.slice(1));
 res.setHeader('Content-Type',source?'text/plain; charset=utf-8':name.endsWith('.js')?'application/javascript':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.webmanifest')?'application/manifest+json':name.endsWith('.png')?'image/png':'image/jpeg');
 if(source==='apps-script/Code.gs')return res.end(stagingCode());
 fs.createReadStream(file).pipe(res);
});}
module.exports={createServer,stagingCode,STAGING_ENDPOINT,STAGING_SHEET};
if(require.main===module)createServer().listen(8767,'127.0.0.1',()=>console.log('Real-backend staging frontend: http://127.0.0.1:8767/ — configure ONLY the verified staging deployment URL.'));
