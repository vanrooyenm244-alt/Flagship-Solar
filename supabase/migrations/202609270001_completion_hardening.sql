-- Completion migration: make the Supabase price adapter usable and tighten photo storage.
create table if not exists public.price_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category text not null default '', supplier text not null default '', code text not null default '',
  description text not null, description_en text, unit text not null default 'each',
  price_type text not null default 'Cost' check (price_type in ('Cost','Sell')),
  cost numeric(14,2) not null default 0 check (cost >= 0), markup numeric(8,2),
  install numeric(14,2) not null default 0 check (install >= 0), spec text not null default '',
  active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(company_id, code)
);
create index if not exists price_items_company_category_idx on public.price_items(company_id, category, description);
alter table public.price_items enable row level security;
drop policy if exists "price items company read" on public.price_items;
create policy "price items company read" on public.price_items for select using (public.is_company_member(company_id));
drop policy if exists "price items managers write" on public.price_items;
create policy "price items managers write" on public.price_items for all
  using (public.has_permission(company_id,'quotes.create'))
  with check (public.has_permission(company_id,'quotes.create'));
drop trigger if exists price_items_touch_updated_at on public.price_items;
create trigger price_items_touch_updated_at before update on public.price_items
  for each row execute procedure public.touch_updated_at();

-- New uploads use <user-uuid>/job-cards/...; do not expose every photo to every authenticated user.
drop policy if exists "job card photo upload" on storage.objects;
drop policy if exists "job card photo read" on storage.objects;
drop policy if exists "job card photo owner upload" on storage.objects;
drop policy if exists "job card photo owner read" on storage.objects;
create policy "job card photo owner upload" on storage.objects for insert to authenticated
  with check (bucket_id='job-card-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "job card photo owner read" on storage.objects for select to authenticated
  using (bucket_id='job-card-photos' and (storage.foldername(name))[1] = auth.uid()::text);
