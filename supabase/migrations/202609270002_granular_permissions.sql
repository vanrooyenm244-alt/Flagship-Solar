-- Granular Flagship module permissions. Commit only; do not apply to production without approval.
insert into public.permissions(key,description) values
 ('job_cards.view','View Job Cards'),('job_cards.edit','Create and edit Job Cards'),
 ('inspections.view','View inspections'),('inspections.edit','Create and edit inspections'),
 ('timesheets.view_own','View own timesheets'),('timesheets.edit_own','Edit own timesheets'),('timesheets.manage','Manage team timesheets'),
 ('stock.view','View stock'),('stock.count','Submit stock counts'),('stock.manage','Manage stock catalogue and adjustments'),
 ('prices.view','View sell prices'),('prices.manage','Manage costs, markups and price imports'),
 ('quotes.view','View quotes'),('quotes.create','Create quote drafts'),('quotes.manage','Manage and send quotes'),
 ('proposals.view','View value proposals'),('proposals.create','Create value proposals'),('proposals.manage','Manage/publish value proposals'),
 ('calendar.view','View assigned calendar'),('calendar.manage','Manage calendar and assignments'),
 ('users.manage','Manage users and module permissions'),('xero.send','Send approved records to Xero')
on conflict(key) do update set description=excluded.description;

-- Seed sensible role defaults. Per-user overrides in membership_permissions win over these.
insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on
 (r.name='Admin') or
 (r.name='Manager' and p.key in ('job_cards.view','job_cards.edit','inspections.view','inspections.edit','timesheets.view_own','timesheets.edit_own','timesheets.manage','stock.view','stock.count','prices.view','quotes.view','quotes.create','proposals.view','proposals.create','calendar.view','calendar.manage')) or
 (r.name='Technician' and p.key in ('job_cards.view','job_cards.edit','inspections.view','inspections.edit','timesheets.view_own','timesheets.edit_own','stock.view','stock.count','calendar.view')) or
 (r.name='Worker' and p.key in ('job_cards.view','timesheets.view_own','timesheets.edit_own','calendar.view'))
on conflict(role_id,permission_key) do nothing;
