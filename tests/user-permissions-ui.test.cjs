const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const client=fs.readFileSync('supabase-client.js','utf8');
test('Users UI exposes per-user module permissions',()=>{assert.ok(html.includes('loadSupabasePermissionManager_'));assert.ok(html.includes('setMembershipPermission'));for(const key of ['inspections.view','job_cards.view','timesheets.view_own','stock.view','prices.view','quotes.view','proposals.view','users.manage'])assert.ok(html.includes(key),key);});
test('Supabase memberships include IDs needed for per-user overrides',()=>{assert.ok(client.includes('select=id,company_id,role_id'));assert.ok(client.includes('listCompanyMemberships'));});
