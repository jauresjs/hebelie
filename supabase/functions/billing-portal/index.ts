import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

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
  try {
    const body = await req.json();
    clinic_id = String(body?.clinic_id ?? "").trim();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!clinic_id) return json({ error: "bad_request" }, 400);

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

  const { data: clinic } = await admin
    .from("clinics")
    .select("stripe_customer_id")
    .eq("id", clinic_id)
    .maybeSingle();

  if (!clinic?.stripe_customer_id) {
    return json({ error: "no_customer" }, 400);
  }

  const siteUrl = (Deno.env.get("SITE_URL") ?? "https://hebelie.com").replace(/\/$/, "");
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const portal = await stripe.billingPortal.sessions.create({
    customer: clinic.stripe_customer_id,
    return_url: `${siteUrl}/dashboard.html?tab=billing`,
  });

  return json({ url: portal.url });
});
