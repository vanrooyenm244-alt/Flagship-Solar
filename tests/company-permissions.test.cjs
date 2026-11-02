const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('apps-script/Code.gs', 'utf8');
const declaration = source.match(/function permissionCompany_\(body\)\s*\{[\s\S]*?\n\}/);
assert.ok(declaration, 'permissionCompany_ must exist');

const context = {};
vm.runInNewContext(declaration[0] + '; this.permissionCompany_ = permissionCompany_;', context);

test('shared Job Card view and save routes use the selected company', () => {
  for (const action of ['jobCards', 'jobCardSave', 'jobCardDelete']) {
    assert.equal(context.permissionCompany_({ action, company: 'Hi Service' }), 'Hi Service');
    assert.equal(context.permissionCompany_({ action, company: 'Flagship Solar' }), 'Flagship Solar');
  }
});

test('invalid or missing company cannot select Hi Service permissions', () => {
  assert.equal(context.permissionCompany_({ action: 'jobCardSave', company: 'Other' }), 'Flagship Solar');
  assert.equal(context.permissionCompany_({ action: 'jobCardSave' }), 'Flagship Solar');
});

test('Hi Service photo download requires Job Card view permission', () => {
  assert.match(source, /"hiTimeTreePhotos":"job_cards\.view"/);
});
