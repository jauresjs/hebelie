-- Multi-tenant embed: clinics + clinic_id on atelier rows.

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  logo_url text,
  accent_color text default '#9A8565',
  lead_email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.atelier_previews
  add column if not exists clinic_id uuid references public.clinics (id) on delete set null;

alter table public.atelier_leads
  add column if not exists clinic_id uuid references public.clinics (id) on delete set null;

create index if not exists atelier_leads_clinic_created_idx
  on public.atelier_leads (clinic_id, created_at desc);

alter table public.clinics enable row level security;

create or replace function public.get_clinic_by_slug(p_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  logo_url text,
  accent_color text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.slug, c.name, c.logo_url, c.accent_color
  from public.clinics c
  where c.slug = lower(trim(p_slug)) and c.active = true
  limit 1;
$$;

grant execute on function public.get_clinic_by_slug(text) to anon, authenticated;

insert into public.clinics (slug, name, lead_email, accent_color)
values ('demo-medspa', 'Demo Medspa', 'privacy@hebelie.com', '#9A8565')
on conflict (slug) do nothing;
