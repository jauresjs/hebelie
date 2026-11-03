-- Patient-facing embed language (English or French).

alter table public.clinics
  add column if not exists embed_locale text not null default 'en';

alter table public.clinics
  drop constraint if exists clinics_embed_locale_check;

alter table public.clinics
  add constraint clinics_embed_locale_check
  check (embed_locale in ('en', 'fr'));

comment on column public.clinics.embed_locale is
  'Language for website embed UI and welcome popup (en | fr).';

drop function if exists public.get_clinic_embed_public(text);

create function public.get_clinic_embed_public(p_slug text)
returns table (
  slug text,
  name text,
  embed_auto_prompt boolean,
  embed_button_label text,
  embed_button_bg text,
  embed_button_text text,
  embed_locale text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.slug,
    c.name,
    c.embed_auto_prompt,
    c.embed_button_label,
    coalesce(c.embed_button_bg, c.accent_color, '#9A8565') as embed_button_bg,
    c.embed_button_text,
    c.embed_locale
  from public.clinics c
  where c.slug = lower(trim(p_slug)) and c.active = true
  limit 1;
$$;

grant execute on function public.get_clinic_embed_public(text) to anon, authenticated;

drop function if exists public.get_clinic_by_slug(text);

create function public.get_clinic_by_slug(p_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  logo_url text,
  accent_color text,
  booking_url text,
  embed_locale text
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
    c.embed_locale
  from public.clinics c
  where c.slug = lower(trim(p_slug)) and c.active = true
  limit 1;
$$;

grant execute on function public.get_clinic_by_slug(text) to anon, authenticated;

drop function if exists public.get_my_clinics();

create function public.get_my_clinics()
returns table (
  id uuid,
  slug text,
  name text,
  lead_email text,
  website_url text,
  booking_url text,
  accent_color text,
  logo_url text,
  embed_button_label text,
  embed_button_bg text,
  embed_button_text text,
  notify_lead_email boolean,
  embed_auto_prompt boolean,
  subscription_status text,
  billing_plan text,
  preview_quota_monthly integer,
  previews_used_period integer,
  billing_period_end timestamptz,
  billing_exempt boolean,
  stripe_customer_id text,
  max_previews_per_visitor_per_day integer,
  billing_country text,
  billing_region text,
  embed_locale text
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
    c.lead_email,
    c.website_url,
    c.booking_url,
    c.accent_color,
    c.logo_url,
    c.embed_button_label,
    c.embed_button_bg,
    c.embed_button_text,
    c.notify_lead_email,
    c.embed_auto_prompt,
    c.subscription_status,
    c.billing_plan,
    c.preview_quota_monthly,
    c.previews_used_period,
    c.billing_period_end,
    c.billing_exempt,
    c.stripe_customer_id,
    c.max_previews_per_visitor_per_day,
    c.billing_country,
    c.billing_region,
    c.embed_locale
  from public.clinics c
  inner join public.clinic_members m on m.clinic_id = c.id
  where m.user_id = auth.uid() and c.active = true
  order by c.name;
$$;

grant execute on function public.get_my_clinics() to authenticated;

drop function if exists public.update_my_clinic(
  uuid, text, text, text, text, text, boolean, boolean, integer, boolean
);

create or replace function public.update_my_clinic(
  p_clinic_id uuid,
  p_website_url text default null,
  p_booking_url text default null,
  p_embed_button_label text default null,
  p_embed_button_bg text default null,
  p_embed_button_text text default null,
  p_notify_lead_email boolean default null,
  p_embed_auto_prompt boolean default null,
  p_max_previews_per_visitor_per_day integer default null,
  p_clear_visitor_daily_cap boolean default null,
  p_embed_locale text default null
)
returns table (
  id uuid,
  slug text,
  name text,
  website_url text,
  booking_url text,
  embed_button_label text,
  embed_button_bg text,
  embed_button_text text,
  notify_lead_email boolean,
  embed_auto_prompt boolean,
  max_previews_per_visitor_per_day integer,
  embed_locale text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap integer;
  v_locale text;
begin
  if not exists (
    select 1 from public.clinic_members m
    where m.clinic_id = p_clinic_id and m.user_id = auth.uid()
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_cap := null;
  if p_clear_visitor_daily_cap is true then
    v_cap := null;
  elsif p_max_previews_per_visitor_per_day is not null then
    v_cap := greatest(2, least(100, p_max_previews_per_visitor_per_day));
  end if;

  v_locale := null;
  if p_embed_locale is not null then
    v_locale := lower(trim(p_embed_locale));
    if v_locale not in ('en', 'fr') then
      raise exception 'invalid_embed_locale' using errcode = '22023';
    end if;
  end if;

  update public.clinics c
  set
    website_url = nullif(trim(coalesce(p_website_url, c.website_url)), ''),
    booking_url = nullif(trim(coalesce(p_booking_url, c.booking_url)), ''),
    embed_button_label = nullif(trim(coalesce(p_embed_button_label, c.embed_button_label)), ''),
    embed_button_bg = nullif(trim(coalesce(p_embed_button_bg, c.embed_button_bg)), ''),
    embed_button_text = nullif(trim(coalesce(p_embed_button_text, c.embed_button_text)), ''),
    notify_lead_email = coalesce(p_notify_lead_email, c.notify_lead_email),
    embed_auto_prompt = coalesce(p_embed_auto_prompt, c.embed_auto_prompt),
    max_previews_per_visitor_per_day = case
      when p_clear_visitor_daily_cap is true then null
      when p_max_previews_per_visitor_per_day is not null then v_cap
      else c.max_previews_per_visitor_per_day
    end,
    embed_locale = coalesce(v_locale, c.embed_locale)
  where c.id = p_clinic_id and c.active = true;

  return query
  select
    c.id,
    c.slug,
    c.name,
    c.website_url,
    c.booking_url,
    c.embed_button_label,
    c.embed_button_bg,
    c.embed_button_text,
    c.notify_lead_email,
    c.embed_auto_prompt,
    c.max_previews_per_visitor_per_day,
    c.embed_locale
  from public.clinics c
  where c.id = p_clinic_id;
end;
$$;

grant execute on function public.update_my_clinic(
  uuid, text, text, text, text, text, boolean, boolean, integer, boolean, text
) to authenticated;

-- Quebec / French-market clinics: default patient UI to French.
update public.clinics
set embed_locale = 'fr'
where embed_locale = 'en'
  and (
    billing_country = 'FR'
    or upper(coalesce(billing_region, '')) in ('QC', 'QUEBEC', 'QUÉBEC')
  );
