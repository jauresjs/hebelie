-- Clinic billing: Stripe subscription + monthly preview quota.

alter table public.clinics
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists billing_plan text,
  add column if not exists preview_quota_monthly integer not null default 0,
  add column if not exists previews_used_period integer not null default 0,
  add column if not exists billing_period_start timestamptz,
  add column if not exists billing_period_end timestamptz,
  add column if not exists billing_exempt boolean not null default false;

update public.clinics
set billing_exempt = true
where slug = 'demo-medspa';

create index if not exists clinics_stripe_customer_idx
  on public.clinics (stripe_customer_id)
  where stripe_customer_id is not null;

create or replace function public.clinic_preview_allowed(p_clinic_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.clinics%rowtype;
begin
  select * into c from public.clinics where id = p_clinic_id;
  if not found or not c.active then
    return false;
  end if;
  if c.billing_exempt then
    return true;
  end if;
  if c.subscription_status is null or c.subscription_status not in ('active', 'trialing') then
    return false;
  end if;
  if c.preview_quota_monthly <= 0 then
    return false;
  end if;
  return c.previews_used_period < c.preview_quota_monthly;
end;
$$;

revoke all on function public.clinic_preview_allowed(uuid) from public;
grant execute on function public.clinic_preview_allowed(uuid) to service_role;

create or replace function public.increment_clinic_preview_usage(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clinics
  set previews_used_period = previews_used_period + 1
  where id = p_clinic_id
    and (billing_exempt or subscription_status in ('active', 'trialing'));
end;
$$;

revoke all on function public.increment_clinic_preview_usage(uuid) from public;
grant execute on function public.increment_clinic_preview_usage(uuid) to service_role;

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
  stripe_customer_id text
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
    c.stripe_customer_id
  from public.clinics c
  inner join public.clinic_members m on m.clinic_id = c.id
  where m.user_id = auth.uid() and c.active = true
  order by c.name;
$$;

grant execute on function public.get_my_clinics() to authenticated;
