-- Expose billing country to embed for Canada-only language switcher.

drop function if exists public.get_clinic_by_slug(text);

create function public.get_clinic_by_slug(p_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  logo_url text,
  accent_color text,
  booking_url text,
  embed_locale text,
  billing_country text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.slug,
    c.name,
    c.logo_url,
    c.accent_color,
    c.booking_url,
    c.embed_locale,
    c.billing_country
  from public.clinics c
  where c.slug = lower(trim(p_slug)) and c.active = true
  limit 1;
$$;

grant execute on function public.get_clinic_by_slug(text) to anon, authenticated;
