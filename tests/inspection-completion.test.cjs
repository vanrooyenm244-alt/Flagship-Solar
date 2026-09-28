const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');const h=fs.readFileSync('index.html','utf8');
test('inspection camera inputs request images from field devices',()=>{assert.ok(h.includes('class="pk" type="file" accept="image/*" capture="environment"'));});
test('inspection snapshots carry versioned summary and update time',()=>{for(const x of ['function inspectionSummary_()','version:2','summary:inspectionSummary_()','updatedAt:Date.now()'])assert.ok(h.includes(x),x);});
test('inspection export saves current edits and warns on critical findings',()=>{assert.ok(h.includes('function runExport(want){\n  save();'));assert.ok(h.includes('This inspection contains a CRITICAL finding'));});
