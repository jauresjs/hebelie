-- Clinic billing locale: country + state/province for CAD vs USD checkout.

alter table public.clinics
  add column if not exists billing_country text not null default 'CA',
  add column if not exists billing_region text;

comment on column public.clinics.billing_country is 'ISO 3166-1 alpha-2; CA → CAD, else USD at same dollar amounts.';
comment on column public.clinics.billing_region is 'US state, CA province, or free-text region for other countries.';

alter table public.clinics
  drop constraint if exists clinics_billing_country_check;

alter table public.clinics
  add constraint clinics_billing_country_check
  check (billing_country ~ '^[A-Z]{2}$');

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
  billing_region text
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
    c.billing_region
  from public.clinics c
  inner join public.clinic_members m on m.clinic_id = c.id
  where m.user_id = auth.uid() and c.active = true
  order by c.name;
$$;

grant execute on function public.get_my_clinics() to authenticated;
