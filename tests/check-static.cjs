// Parse local source only. Never read the private deployment configuration.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
let units=0;
for(const dir of ['.','apps-script','tests'])for(const name of fs.readdirSync(dir)){
  if(name==='supabase-config.js')continue;
  const file=path.join(dir,name);
  if(!fs.statSync(file).isFile())continue;
  if(/\.(js|cjs|gs)$/.test(name)){new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});units++;}
  else if(/\.html$/.test(name))for(const m of fs.readFileSync(file,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){new vm.Script(m[1],{filename:file});units++;}
}
JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
console.log(`PASS: ${units} JavaScript units and manifest JSON; private config excluded.`);
