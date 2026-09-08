-- Flagship Ops shared field-service foundation. Run in Supabase SQL Editor or
-- through the Supabase CLI before enabling supabase-config.js in the PWA.
create extension if not exists pgcrypto;
create extension if not exists postgis;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(), slug text not null unique,
  name text not null, branding jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', preferred_language text not null default 'en' check (preferred_language in ('en','af')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.roles (id uuid primary key default gen_random_uuid(), name text not null unique, description text);
create table if not exists public.permissions (key text primary key, description text not null);
create table if not exists public.job_capabilities (key text primary key, description text not null);
create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, role_id uuid references public.roles(id), active boolean not null default true,
  unique(company_id,user_id)
);
create table if not exists public.role_permissions (role_id uuid references public.roles(id) on delete cascade, permission_key text references public.permissions(key) on delete cascade, primary key(role_id,permission_key));
create table if not exists public.membership_permissions (membership_id uuid references public.company_memberships(id) on delete cascade, permission_key text references public.permissions(key) on delete cascade, allowed boolean not null default true, primary key(membership_id,permission_key));
create table if not exists public.membership_capabilities (membership_id uuid references public.company_memberships(id) on delete cascade, capability_key text references public.job_capabilities(key) on delete cascade, primary key(membership_id,capability_key));

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), name text not null, phone text, email text, address text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), customer_id uuid references public.customers(id),
  title text not null, address text, location geography(point,4326), job_type text not null, starts_at timestamptz not null, ends_at timestamptz,
  instructions text, status text not null default 'scheduled' check (status in ('draft','requested','scheduled','in_progress','completed','reviewed','cancelled')),
  quote_reference text, xero_reference text, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.job_assignments (
  job_id uuid not null references public.jobs(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
  assignment_role text not null check (assignment_role in ('lead','helper')), assigned_at timestamptz not null default now(), primary key(job_id,user_id)
);
create unique index if not exists one_lead_per_job on public.job_assignments(job_id) where assignment_role='lead';
create table if not exists public.job_cards (
  id uuid primary key default gen_random_uuid(), client_id text not null unique, company_id uuid references public.companies(id), job_id uuid references public.jobs(id),
  customer_id uuid references public.customers(id), status text not null default 'DRAFT' check (status in ('DRAFT','IN_PROGRESS','COMPLETED','REVIEWED','SUBMITTED')),
  data jsonb not null default '{}'::jsonb, created_by uuid references public.profiles(id) default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.job_card_items (
  id uuid primary key default gen_random_uuid(), job_card_id uuid not null references public.job_cards(id) on delete cascade, item_type text not null,
  description text, quantity numeric, unit text, data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(), company_id uuid references public.companies(id), job_id uuid references public.jobs(id) on delete cascade,
  job_card_id uuid references public.job_cards(id) on delete cascade, bucket text not null, path text not null unique, content_type text, created_by uuid references public.profiles(id) default auth.uid(), created_at timestamptz not null default now()
);
create table if not exists public.timesheets (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), job_id uuid references public.jobs(id), user_id uuid not null references public.profiles(id),
  arrived_at timestamptz, departed_at timestamptz, arrival_location geography(point,4326), departure_location geography(point,4326), source text not null default 'manual' check(source in ('manual','foreground_gps','native_background')),
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), job_id uuid unique references public.jobs(id) on delete cascade,
  title text not null, starts_at timestamptz not null, ends_at timestamptz, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(), requesting_company_id uuid not null references public.companies(id), owning_company_id uuid not null references public.companies(id),
  requested_user_id uuid not null references public.profiles(id), job_id uuid references public.jobs(id), starts_at timestamptz not null, ends_at timestamptz,
  status text not null default 'pending' check(status in ('pending','approved','declined','expired')), decision_by uuid references public.profiles(id), decision_at timestamptz, authorization_code_hash text, authorization_expires_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), type text not null, payload jsonb not null default '{}'::jsonb,
  read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.audit_log (
  id bigint generated always as identity primary key, company_id uuid references public.companies(id), actor_id uuid references public.profiles(id),
  entity_type text not null, entity_id uuid, action text not null, before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);

insert into public.companies(slug,name) values ('flagship-solar','Flagship Solar'),('hi-service','Hi Service') on conflict(slug) do nothing;
insert into public.roles(name,description) values ('Admin','Full company administration'),('Manager','Scheduling and review'),('Technician','Assigned field work'),('Worker','Assigned assistance') on conflict(name) do nothing;
insert into public.permissions(key,description) values
 ('jobs.manage','Create and change company jobs'),('jobs.view_all','View unassigned company jobs'),('calendar.manage','Manage calendar and assignments'),('calendar.view_all','View team calendar'),('job_cards.review','Review completed job cards'),('members.manage','Manage memberships and permissions'),('quotes.create','Create quote drafts') on conflict(key) do nothing;
insert into public.job_capabilities(key,description) values ('coc_inspection','COC inspection'),('installation','Installation'),('service','Service'),('site_visit','Site visit'),('fault_finding','Fault finding') on conflict(key) do nothing;

create or replace function public.is_company_member(target_company uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from company_memberships m where m.company_id=target_company and m.user_id=auth.uid() and m.active)
$$;
create or replace function public.has_permission(target_company uuid, wanted text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from company_memberships m left join role_permissions rp on rp.role_id=m.role_id and rp.permission_key=wanted left join membership_permissions mp on mp.membership_id=m.id and mp.permission_key=wanted where m.company_id=target_company and m.user_id=auth.uid() and m.active and coalesce(mp.allowed, rp.permission_key is not null, false))
$$;
create or replace function public.can_access_job(target_job uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from jobs j where j.id=target_job and (has_permission(j.company_id,'jobs.view_all') or exists(select 1 from job_assignments a where a.job_id=j.id and a.user_id=auth.uid())))
$$;
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create or replace function public.create_profile() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.email,'')) on conflict(id) do nothing; return new; end $$;
drop trigger if exists auth_user_profile on auth.users;
create trigger auth_user_profile after insert on auth.users for each row execute procedure public.create_profile();
create or replace function public.audit_booking_decision() returns trigger language plpgsql security definer set search_path=public as $$ begin if old.status is distinct from new.status then insert into audit_log(company_id,actor_id,entity_type,entity_id,action,before_data,after_data) values(new.owning_company_id,auth.uid(),'booking_request',new.id,'decision',jsonb_build_object('status',old.status),jsonb_build_object('status',new.status)); end if; return new; end $$;
drop trigger if exists booking_request_audit on public.booking_requests;
create trigger booking_request_audit after update on public.booking_requests for each row execute procedure public.audit_booking_decision();
do $$ declare t text; begin foreach t in array array['profiles','companies','roles','permissions','job_capabilities','company_memberships','role_permissions','membership_permissions','membership_capabilities','customers','jobs','job_assignments','job_cards','job_card_items','files','timesheets','calendar_events','booking_requests','notifications','audit_log'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;

create policy "profiles self" on public.profiles for select using (id=auth.uid());
create policy "profiles self update" on public.profiles for update using (id=auth.uid()) with check (id=auth.uid());
create policy "companies members" on public.companies for select using (is_company_member(id));
create policy "reference tables readable" on public.roles for select using (auth.uid() is not null);
create policy "permissions readable" on public.permissions for select using (auth.uid() is not null);
create policy "capabilities readable" on public.job_capabilities for select using (auth.uid() is not null);
create policy "memberships own or managers" on public.company_memberships for select using (user_id=auth.uid() or has_permission(company_id,'members.manage'));
create policy "memberships managers manage" on public.company_memberships for all using (has_permission(company_id,'members.manage')) with check (has_permission(company_id,'members.manage'));
create policy "role permissions readable" on public.role_permissions for select using (auth.uid() is not null);
create policy "membership permissions own or manager" on public.membership_permissions for select using (exists(select 1 from company_memberships m where m.id=membership_id and (m.user_id=auth.uid() or has_permission(m.company_id,'members.manage'))));
create policy "membership permissions manager" on public.membership_permissions for all using (exists(select 1 from company_memberships m where m.id=membership_id and has_permission(m.company_id,'members.manage'))) with check (exists(select 1 from company_memberships m where m.id=membership_id and has_permission(m.company_id,'members.manage')));
create policy "membership capabilities own or manager" on public.membership_capabilities for select using (exists(select 1 from company_memberships m where m.id=membership_id and (m.user_id=auth.uid() or has_permission(m.company_id,'members.manage'))));
create policy "membership capabilities manager" on public.membership_capabilities for all using (exists(select 1 from company_memberships m where m.id=membership_id and has_permission(m.company_id,'members.manage'))) with check (exists(select 1 from company_memberships m where m.id=membership_id and has_permission(m.company_id,'members.manage')));
create policy "customers company" on public.customers for select using (is_company_member(company_id));
create policy "customers managers" on public.customers for all using (has_permission(company_id,'jobs.manage')) with check (has_permission(company_id,'jobs.manage'));
create policy "jobs assigned or permitted" on public.jobs for select using (can_access_job(id));
create policy "jobs managers create" on public.jobs for insert with check (has_permission(company_id,'jobs.manage'));
create policy "jobs managers update" on public.jobs for update using (has_permission(company_id,'jobs.manage')) with check (has_permission(company_id,'jobs.manage'));
create policy "assignments job access" on public.job_assignments for select using (can_access_job(job_id));
create policy "assignments managers" on public.job_assignments for all using (exists(select 1 from jobs j where j.id=job_id and has_permission(j.company_id,'calendar.manage'))) with check (exists(select 1 from jobs j where j.id=job_id and has_permission(j.company_id,'calendar.manage')));
create policy "job cards assigned or managers" on public.job_cards for select using ((job_id is not null and can_access_job(job_id)) or (job_id is null and created_by=auth.uid()) or has_permission(company_id,'job_cards.review'));
create policy "job cards create" on public.job_cards for insert with check (created_by=auth.uid() and (company_id is null or is_company_member(company_id)));
create policy "job cards update author or manager" on public.job_cards for update using (created_by=auth.uid() or has_permission(company_id,'job_cards.review')) with check (created_by=auth.uid() or has_permission(company_id,'job_cards.review'));
create policy "items card access" on public.job_card_items for select using (exists(select 1 from job_cards c where c.id=job_card_id and ((c.job_id is not null and can_access_job(c.job_id)) or c.created_by=auth.uid() or has_permission(c.company_id,'job_cards.review'))));
create policy "items card author" on public.job_card_items for all using (exists(select 1 from job_cards c where c.id=job_card_id and (c.created_by=auth.uid() or has_permission(c.company_id,'job_cards.review')))) with check (exists(select 1 from job_cards c where c.id=job_card_id and (c.created_by=auth.uid() or has_permission(c.company_id,'job_cards.review'))));
create policy "timesheets own or managers" on public.timesheets for select using (user_id=auth.uid() or has_permission(company_id,'jobs.manage'));
create policy "timesheets own create" on public.timesheets for insert with check (user_id=auth.uid() and is_company_member(company_id));
create policy "timesheets own update" on public.timesheets for update using (user_id=auth.uid() or has_permission(company_id,'jobs.manage')) with check (user_id=auth.uid() or has_permission(company_id,'jobs.manage'));
create policy "calendar members" on public.calendar_events for select using (is_company_member(company_id));
create policy "calendar managers" on public.calendar_events for all using (has_permission(company_id,'calendar.manage')) with check (has_permission(company_id,'calendar.manage'));
create policy "booking parties" on public.booking_requests for select using (has_permission(requesting_company_id,'calendar.manage') or has_permission(owning_company_id,'calendar.manage') or requested_user_id=auth.uid());
create policy "booking requester" on public.booking_requests for insert with check (has_permission(requesting_company_id,'calendar.manage'));
create policy "booking owner decision" on public.booking_requests for update using (has_permission(owning_company_id,'calendar.manage')) with check (has_permission(owning_company_id,'calendar.manage'));
create policy "notifications recipient" on public.notifications for select using (user_id=auth.uid());
create policy "notifications recipient update" on public.notifications for update using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "audit managers read" on public.audit_log for select using (has_permission(company_id,'jobs.manage'));

insert into storage.buckets(id,name,public) values ('job-card-photos','job-card-photos',false) on conflict(id) do nothing;
create policy "job card photo upload" on storage.objects for insert to authenticated with check (bucket_id='job-card-photos');
create policy "job card photo read" on storage.objects for select to authenticated using (bucket_id='job-card-photos');
