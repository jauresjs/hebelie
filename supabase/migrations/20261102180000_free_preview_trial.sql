-- One-time free preview trial for new clinics (subscription_status = 'trial').

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
  if c.subscription_status is null
    or c.subscription_status not in ('active', 'trialing', 'trial') then
    return false;
  end if;
  if c.preview_quota_monthly <= 0 then
    return false;
  end if;
  return c.previews_used_period < c.preview_quota_monthly;
end;
$$;

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
    and (
      billing_exempt
      or subscription_status in ('active', 'trialing', 'trial')
    );
end;
$$;

comment on column public.clinics.subscription_status is
  'Stripe status (active, trialing, …) or Hebelie free preview trial (trial).';
