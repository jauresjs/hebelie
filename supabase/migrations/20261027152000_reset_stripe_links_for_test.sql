-- Clear Stripe IDs from live-mode setup so test keys can attach fresh customers.

update public.clinics
set
  stripe_customer_id = null,
  stripe_subscription_id = null,
  subscription_status = null,
  billing_plan = null,
  preview_quota_monthly = case when billing_exempt then preview_quota_monthly else 0 end,
  previews_used_period = 0,
  billing_period_start = null,
  billing_period_end = null
where stripe_customer_id is not null
   or stripe_subscription_id is not null
   or subscription_status is not null;
