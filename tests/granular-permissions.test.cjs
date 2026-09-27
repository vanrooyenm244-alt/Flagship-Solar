const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const sql=fs.readFileSync('supabase/migrations/202609270002_granular_permissions.sql','utf8'),client=fs.readFileSync('supabase-client.js','utf8');
test('granular permissions cover every Flagship operational module',()=>{for(const k of ['job_cards.edit','inspections.edit','timesheets.manage','stock.manage','prices.manage','quotes.manage','proposals.manage','calendar.manage','users.manage','xero.send'])assert.ok(sql.includes(k),k);});
test('per-user permission overrides remain authoritative over role defaults',()=>{assert.ok(sql.includes('membership_permissions'));assert.ok(client.includes('setMembershipPermission'));assert.ok(client.includes('permissionsForMembership'));});
test('permission client uses authenticated RLS REST paths only',()=>{assert.ok(client.includes("rest('membership_permissions'"));assert.ok(client.includes("rest('permissions'"));});
