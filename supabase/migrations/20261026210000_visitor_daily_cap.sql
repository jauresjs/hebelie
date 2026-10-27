-- Per-visitor daily preview cap (clinic-configurable, minimum 2 when capped).

alter table public.clinics
  add column if not exists max_previews_per_visitor_per_day integer default 5;

comment on column public.clinics.max_previews_per_visitor_per_day is
  'Max successful embed previews per signed-in visitor per UTC day. NULL = no daily cap. When set, must be >= 2.';

update public.clinics
set max_previews_per_visitor_per_day = 5
where max_previews_per_visitor_per_day is null
  and slug <> 'demo-medspa';

update public.clinics
set max_previews_per_visitor_per_day = null
where slug = 'demo-medspa';

create or replace function public.clinic_visitor_preview_allowed(
  p_clinic_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cap integer;
  used integer;
  day_start timestamptz;
begin
  select c.max_previews_per_visitor_per_day into cap
  from public.clinics c
  where c.id = p_clinic_id and c.active = true;

  if not found then
    return false;
  end if;

  if cap is null then
    return true;
  end if;

  if cap < 2 then
    cap := 2;
  end if;

  day_start := (date_trunc('day', now() at time zone 'utc') at time zone 'utc');

  select count(*)::integer into used
  from public.atelier_previews p
  where p.clinic_id = p_clinic_id
    and p.user_id = p_user_id
    and p.created_at >= day_start;

  return used < cap;
end;
$$;

revoke all on function public.clinic_visitor_preview_allowed(uuid, uuid) from public;
grant execute on function public.clinic_visitor_preview_allowed(uuid, uuid) to service_role;

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
  max_previews_per_visitor_per_day integer
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
    c.max_previews_per_visitor_per_day
  from public.clinics c
  inner join public.clinic_members m on m.clinic_id = c.id
  where m.user_id = auth.uid() and c.active = true
  order by c.name;
$$;

grant execute on function public.get_my_clinics() to authenticated;

drop function if exists public.update_my_clinic(uuid, text, text, text, text, text, boolean, boolean);

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
  p_clear_visitor_daily_cap boolean default null
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
  max_previews_per_visitor_per_day integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap integer;
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
    end
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
    c.max_previews_per_visitor_per_day
  from public.clinics c
  where c.id = p_clinic_id;
end;
$$;

grant execute on function public.update_my_clinic(
  uuid, text, text, text, text, text, boolean, boolean, integer, boolean
) to authenticated;
