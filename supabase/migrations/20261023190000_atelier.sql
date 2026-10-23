-- Hebelie atelier (static landing) — minimal tables, separate from clinic SaaS schema.

create table if not exists public.atelier_previews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  treatments text[] not null,
  intensity text not null default 'medium',
  after_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.atelier_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  preview_id uuid references public.atelier_previews (id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  treatments text[],
  created_at timestamptz not null default now()
);

create index if not exists atelier_previews_user_created_idx
  on public.atelier_previews (user_id, created_at desc);

alter table public.atelier_previews enable row level security;
alter table public.atelier_leads enable row level security;

drop policy if exists "atelier_previews_select_own" on public.atelier_previews;
create policy "atelier_previews_select_own"
  on public.atelier_previews for select
  using (auth.uid() = user_id);

drop policy if exists "atelier_leads_select_own" on public.atelier_leads;
create policy "atelier_leads_select_own"
  on public.atelier_leads for select
  using (auth.uid() = user_id);

drop policy if exists "atelier_leads_insert_own" on public.atelier_leads;
create policy "atelier_leads_insert_own"
  on public.atelier_leads for insert
  with check (auth.uid() = user_id);

grant select on public.atelier_previews to authenticated;
grant select, insert on public.atelier_leads to authenticated;
