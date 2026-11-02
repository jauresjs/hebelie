import { createClient } from "npm:@supabase/supabase-js@2";
import { emailClinicAboutLead } from "../_shared/clinic-lead-notify.ts";

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

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "unauthorized" }, 401);

  const anon = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: auth } } },
  );
  const { data: userData, error: userErr } = await anon.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);

  let leadId: string;
  try {
    const body = await req.json();
    leadId = body?.lead_id;
    if (!leadId) return json({ error: "bad_request" }, 400);
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: lead, error: leadErr } = await admin
    .from("atelier_leads")
    .select("id, user_id, clinic_id")
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr || !lead || lead.user_id !== userData.user.id) {
    return json({ error: "not_found" }, 404);
  }

  if (!lead.clinic_id) return json({ sent: false, reason: "no_clinic" });

  const mailed = await emailClinicAboutLead(admin, { leadId, kind: "consultation" });
  if (!mailed.ok) {
    const status = mailed.reason === "send_failed" ? 502 : 200;
    return json({ sent: false, reason: mailed.reason ?? "failed" }, status);
  }

  return json({ sent: true });
});
