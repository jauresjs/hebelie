-- Per-clinic booking link for post-preview CTA.

alter table public.clinics
  add column if not exists booking_url text;

comment on column public.clinics.booking_url is 'Patient-facing URL opened after preview (Calendly, clinic site, etc.).';

drop function if exists public.get_clinic_by_slug(text);

create function public.get_clinic_by_slug(p_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  logo_url text,
  accent_color text,
  booking_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.slug, c.name, c.logo_url, c.accent_color, c.booking_url
  from public.clinics c
  where c.slug = lower(trim(p_slug)) and c.active = true
  limit 1;
$$;

update public.clinics
set booking_url = coalesce(booking_url, 'https://hebelie.com/#follow')
where slug = 'demo-medspa';
