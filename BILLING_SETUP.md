# Hebelie billing (Stripe + Supabase)

## 1. Database

```powershell
.\scripts\push-db.ps1
```

## 2. Stripe products (CAD, monthly)

Create three products with **lookup keys** (works without env price IDs):

```bash
stripe products create -d name="Hebelie Starter" -d "metadata[hebelie_plan]=starter" -d "metadata[hebelie_quota]=100"
# note product id prod_xxx

stripe prices create -d product=prod_xxx -d currency=cad -d unit_amount=9900 \
  -d "recurring[interval]=month" -d lookup_key=hebelie_starter_monthly_cad \
  -d "metadata[hebelie_plan]=starter" -d "metadata[hebelie_quota]=100"

# Growth: $180 CAD → unit_amount=18000, lookup_key=hebelie_growth_monthly_cad
# Pro: $250 CAD → unit_amount=25000, lookup_key=hebelie_pro_monthly_cad
```

Optional: set Supabase secrets `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_PRO` to the `price_…` IDs.

## 3. Supabase secrets

```bash
npx supabase secrets set STRIPE_SECRET_KEY=sk_live_...
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
npx supabase secrets set SITE_URL=https://hebelie.com
# optional if using lookup keys:
# npx supabase secrets set STRIPE_PRICE_STARTER=price_...
```

## 4. Deploy edge functions

```bash
npx supabase functions deploy create-preview
npx supabase functions deploy billing-checkout
npx supabase functions deploy billing-portal
npx supabase functions deploy stripe-webhook
```

## 5. Stripe webhook

In Stripe Dashboard → Developers → Webhooks, add endpoint:

`https://vqetbgdduoyxbszbrxkl.supabase.co/functions/v1/stripe-webhook`

Events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`

## 6. Frontend config

Copy price IDs into `config.js` (optional, for display only):

```js
stripePrices: {
  starter: "price_...",
  growth: "price_...",
  pro: "price_...",
},
```

## 7. Customer portal

Stripe Dashboard → Settings → Billing → Customer portal → enable subscription management.
