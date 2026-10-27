import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { planFromPriceId, quotaForPlan, type BillingPlan } from "../_shared/billing.ts";

const cors = { "Access-Control-Allow-Origin": "*" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function syncSubscription(
  admin: ReturnType<typeof createClient>,
  sub: Stripe.Subscription,
) {
  const clinicId =
    sub.metadata?.clinic_id ??
    sub.items.data[0]?.price?.metadata?.clinic_id ??
    null;

  if (!clinicId) {
    console.warn("stripe-webhook: subscription missing clinic_id", sub.id);
    return;
  }

  const price = sub.items.data[0]?.price;
  const priceId = price?.id ?? "";
  let plan =
    (sub.metadata?.hebelie_plan as BillingPlan | undefined) ??
    (price?.metadata?.hebelie_plan as BillingPlan | undefined) ??
    planFromPriceId(priceId);
  if (!plan && price?.metadata?.hebelie_quota) {
    const q = Number(price.metadata.hebelie_quota);
    if (q === 100) plan = "starter";
    if (q === 200) plan = "growth";
    if (q === 300) plan = "pro";
  }

  const quota = quotaForPlan(plan);
  const status = sub.status;
  const periodStart = new Date(sub.current_period_start * 1000).toISOString();
  const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

  const update: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    subscription_status: status,
    billing_plan: plan,
    preview_quota_monthly: quota,
    billing_period_start: periodStart,
    billing_period_end: periodEnd,
  };

  if (!["active", "trialing"].includes(status)) {
    update.preview_quota_monthly = 0;
  }

  await admin.from("clinics").update(update).eq("id", clinicId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) return json({ error: "service_unavailable" }, 503);

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return json({ error: "no_signature" }, 400);

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (e) {
    console.error("stripe-webhook verify", e);
    return json({ error: "invalid_signature" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription" || !session.subscription) break;
        const clinicId = session.metadata?.clinic_id ?? session.client_reference_id;
        if (clinicId && session.customer) {
          await admin
            .from("clinics")
            .update({
              stripe_customer_id: String(session.customer),
            })
            .eq("id", clinicId);
        }
        const sub = await stripe.subscriptions.retrieve(String(session.subscription));
        await syncSubscription(admin, sub);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(admin, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const clinicId = sub.metadata?.clinic_id;
        if (clinicId) {
          await admin
            .from("clinics")
            .update({
              stripe_subscription_id: null,
              subscription_status: "canceled",
              billing_plan: null,
              preview_quota_monthly: 0,
              billing_period_start: null,
              billing_period_end: null,
            })
            .eq("id", clinicId);
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.billing_reason !== "subscription_cycle" || !invoice.subscription) break;
        const sub = await stripe.subscriptions.retrieve(String(invoice.subscription));
        const clinicId = sub.metadata?.clinic_id;
        if (clinicId) {
          await admin
            .from("clinics")
            .update({ previews_used_period: 0 })
            .eq("id", clinicId);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("stripe-webhook handler", e);
    return json({ error: "handler_failed" }, 500);
  }

  return json({ received: true });
});
