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
    .select("id, name, lead_email, stripe_customer_id")
    .eq("id", clinic_id)
    .eq("active", true)
    .maybeSingle();
  if (clinicErr || !clinic) return json({ error: "not_found" }, 404);

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  const priceId = await resolvePriceId(stripe, plan);
  if (!priceId) return json({ error: "price_not_configured" }, 503);

  let customerId = clinic.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: clinic.lead_email ?? userData.user.email ?? undefined,
      name: clinic.name,
      metadata: { clinic_id: clinic.id, hebelie: "clinic" },
    });
    customerId = customer.id;
    await admin.from("clinics").update({ stripe_customer_id: customerId }).eq("id", clinic.id);
  }

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

  return json({ url: session.url });
});
