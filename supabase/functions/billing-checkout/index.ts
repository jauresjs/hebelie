import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { resolvePriceId, type BillingPlan } from "../_shared/billing.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isMissingStripeCustomer(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "resource_missing") return true;
  const msg = String(e.message ?? "");
  return /no such customer/i.test(msg) || /test mode key was used/i.test(msg) ||
    /live mode key was used/i.test(msg);
}

async function ensureStripeCustomer(
  stripe: Stripe,
  admin: ReturnType<typeof createClient>,
  clinic: {
    id: string;
    name: string;
    lead_email: string | null;
    stripe_customer_id: string | null;
    billing_exempt?: boolean;
  },
  userEmail: string | undefined,
): Promise<string> {
  let customerId = clinic.stripe_customer_id;

  if (customerId) {
    try {
      await stripe.customers.retrieve(customerId);
      return customerId;
    } catch (err) {
      if (!isMissingStripeCustomer(err)) throw err;
      console.warn("billing-checkout: stale stripe_customer_id, creating new customer", customerId);
    }
  }

  const customer = await stripe.customers.create({
    email: clinic.lead_email ?? userEmail ?? undefined,
    name: clinic.name,
    metadata: { clinic_id: clinic.id, hebelie: "clinic" },
  });

  const billingPatch: Record<string, unknown> = {
    stripe_customer_id: customer.id,
    stripe_subscription_id: null,
    subscription_status: null,
    billing_plan: null,
    previews_used_period: 0,
    billing_period_start: null,
    billing_period_end: null,
  };
  if (!clinic.billing_exempt) billingPatch.preview_quota_monthly = 0;

  await admin.from("clinics").update(billingPatch).eq("id", clinic.id);

  return customer.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ error: "service_unavailable" }, 503);

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "unauthorized" }, 401);

  const anon = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: auth } } },
  );
  const { data: userData, error: userErr } = await anon.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);

  let clinic_id: string;
  let plan: string;
  try {
    const body = await req.json();
    clinic_id = String(body?.clinic_id ?? "").trim();
    plan = String(body?.plan ?? "").trim().toLowerCase();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  if (!clinic_id || !["starter", "growth", "pro"].includes(plan)) {
    return json({ error: "invalid_plan" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: member } = await admin
    .from("clinic_members")
    .select("clinic_id")
    .eq("clinic_id", clinic_id)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!member) return json({ error: "forbidden" }, 403);

  const { data: clinic, error: clinicErr } = await admin
    .from("clinics")
    .select("id, name, lead_email, stripe_customer_id, billing_exempt")
    .eq("id", clinic_id)
    .eq("active", true)
    .maybeSingle();
  if (clinicErr || !clinic) return json({ error: "not_found" }, 404);

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  try {
    const priceId = await resolvePriceId(stripe, plan);
    if (!priceId) return json({ error: "price_not_configured" }, 503);

    const customerId = await ensureStripeCustomer(
      stripe,
      admin,
      clinic,
      userData.user.email ?? undefined,
    );

    const siteUrl = (Deno.env.get("SITE_URL") ?? "https://hebelie.com").replace(/\/$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: clinic.id,
      subscription_data: {
        metadata: { clinic_id: clinic.id, hebelie_plan: plan as BillingPlan },
      },
      metadata: { clinic_id: clinic.id, hebelie_plan: plan },
      success_url: `${siteUrl}/dashboard.html?tab=billing&checkout=success`,
      cancel_url: `${siteUrl}/pricing.html?checkout=canceled`,
    });

    if (!session.url) return json({ error: "checkout_url_missing" }, 502);
    return json({ url: session.url });
  } catch (err) {
    console.error("billing-checkout", err);
    const message = err instanceof Error ? err.message : "stripe_failed";
    if (/no such price/i.test(message) || /a similar object exists in live mode/i.test(message)) {
      return json({ error: "price_mode_mismatch" }, 503);
    }
    return json({ error: "stripe_failed" }, 502);
  }
});
