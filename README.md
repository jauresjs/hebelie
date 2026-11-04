---
published: false
---

# Hebelie

Static landing + atelier preview. Auth and generation run on Supabase (`create-preview` edge function).

Clinic billing: see [_docs/BILLING_SETUP.md](./_docs/BILLING_SETUP.md) (Stripe subscriptions, `pricing.html`, dashboard Billing tab).

**Local:** `python -m http.server 8000` → open `http://localhost:8000/`

**Config:** `config.js` (anon key + project URL). Backend secrets (`FAL_KEY`, optional `RESEND_*`) live in Supabase only.

**Auth email (magic links):** configure Resend SMTP in Supabase — see [_docs/SMTP_SETUP.md](./_docs/SMTP_SETUP.md).
