const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
test('Job Cards expose full field-service work types',()=>{for(const x of ['Full Solar Installation / Commissioning','Solar Service / Fault Finding','Generator / Changeover Integration','Electrical Work','Heat Pump Installation / Repair','Gas Work','Plumbing Work','Fault Finding / Repair'])assert.ok(html.includes(x),x);});
test('Job Cards support repeatable site evidence',()=>{for(const x of ['jcEvidence_','data-jc-ev-add','data-jc-ev-note','data-jc-ev-photo','data-jc-ev-cap','data-jc-ev-remove'])assert.ok(html.includes(x),x);});
test('solar commissioning captures core evidence',()=>{for(const x of ['inverterSerial','batterySerials','strings','pvVoc','pvCurrent','gridFrequency','gridCode','antiIsland','protection','monitoring'])assert.ok(html.includes(x),x);});
test('disciplines capture commissioning tests',()=>{for(const x of ['Earth fault loop impedance','Insulation resistance','Earth leakage / RCD result','Pressure test / operating pressure','Leak / soundness test','Water IN temperature','Water OUT temperature','Tempering / mixing valve'])assert.ok(html.includes(x),x);});
test('PDF waits for images and protects blocks',()=>{assert.ok(html.includes('img.complete&&img.naturalWidth'));assert.ok(html.includes("querySelectorAll('.rphoto,.rblock,tr,h2')"));});

test('Job Cards upload photos before central Job Card save',()=>{const main=fs.readFileSync('index.html','utf8');assert.match(main,/function jcUploadPhotos_/);assert.match(main,/uploadJobCardPhoto\(copy\.id,blob,blob\.type\)/);assert.match(main,/jcUploadPhotos_\(card\)\.then\(function\(remoteCard\)\{return window\.FlagshipSupabase\.saveJobCard\(remoteCard\)\.then\(function\(saved\)\{jcRememberPhotoStorage_\(card,remoteCard\);return saved;\}\);\}\)/);assert.match(main,/photo\.storage=up;photo\.img='storage:'/);});

test('Job Cards hydrate secure central photos for field and PDF views',()=>{const main=fs.readFileSync('index.html','utf8'),client=fs.readFileSync('supabase-client.js','utf8');assert.match(client,/signedJobCardPhotoUrl:/);assert.match(client,/object\/sign\/job-card-photos/);assert.match(main,/function jcHydratePhotos_/);assert.match(main,/signedJobCardPhotoUrl\(v\.storage\.path,3600\)/);assert.match(main,/jcHydratePhotos_\(card\)\.then\(jcImportMissing_\)/);});

test('Job Cards reconcile newer central cards without overwriting local drafts',()=>{const main=fs.readFileSync('index.html','utf8');assert.match(main,/remoteUpdated>localUpdated&&!localDraft/);assert.match(main,/if\(!local\)\{store\.put\(card\);return;\}/);});

test('Job Card submit requires complete Supabase acknowledgement including photos',()=>{const main=fs.readFileSync('index.html','utf8');assert.match(main,/No matching submitted Job Card acknowledgement/);assert.match(main,/Job Card photo\(s\) were not uploaded/);assert.match(main,/String\(remote\.status\|\|''\)\.toUpperCase\(\)!=='SUBMITTED'/);});

test('Job Card multi-photo selection preserves natural PDF aspect ratio',()=>{const main=fs.readFileSync('index.html','utf8');assert.match(main,/accept="image\/\*" multiple data-jc-photo/);assert.match(main,/files\.forEach\(function\(f,n\)/);assert.match(main,/sec\.evidence\.push\(\{note:'',photo:\{img:url,cap:''\}\}\)/);assert.match(main,/max-height:260px;object-fit:contain;margin:0 auto/);assert.match(main,/max-height:80mm/);});

test('Job Cards expose approved Details Photos PDF workflow and gallery',()=>{const main=fs.readFileSync('index.html','utf8');assert.match(main,/data-jc-tab="details"/);assert.match(main,/data-jc-tab="photos"/);assert.match(main,/data-jc-tab="pdf"/);assert.match(main,/id="jcPhotoGallery"/);assert.match(main,/id="jcAddPhotosInput" type="file" accept="image\/\*" multiple/);assert.match(main,/function jcRenderGallery_/);assert.match(main,/className='jc-viewer'/);});

test('Job Card list uses field-ready photo preview cards',()=>{const main=fs.readFileSync('index.html','utf8');assert.match(main,/function jcFirstPhoto_/);assert.match(main,/class="jc-thumb"/);assert.match(main,/jc-cardrow/);assert.match(main,/data-jc-open/);});

test('Job Card photo sync remembers storage and does not re-upload unchanged photos',()=>{const main=fs.readFileSync('index.html','utf8');assert.match(main,/function jcRememberPhotoStorage_/);assert.match(main,/v\.storage&&v\.storage\.bucket==='job-card-photos'&&v\.storage\.path/);assert.match(main,/jcRememberPhotoStorage_\(card,remoteCard\)/);});
