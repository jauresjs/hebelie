import { createClient } from "npm:@supabase/supabase-js@2";

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
    .select("id, name, email, phone, treatments, user_id, clinic_id, preview_id")
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr || !lead || lead.user_id !== userData.user.id) {
    return json({ error: "not_found" }, 404);
  }

  if (!lead.clinic_id) return json({ sent: false, reason: "no_clinic" });

  const { data: clinic } = await admin
    .from("clinics")
    .select("name, lead_email")
    .eq("id", lead.clinic_id)
    .maybeSingle();

  if (!clinic?.lead_email) return json({ sent: false, reason: "no_email" });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.log("notify-lead: no RESEND_API_KEY", lead.id, clinic.lead_email);
    return json({ sent: false, reason: "mail_not_configured" });
  }

  const treatments = Array.isArray(lead.treatments) ? lead.treatments.join(", ") : "";
  const text = [
    `New consultation request for ${clinic.name}`,
    "",
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    lead.phone ? `Phone: ${lead.phone}` : "",
    treatments ? `Treatments: ${treatments}` : "",
    "",
    "Sent via Hebelie embed.",
  ]
    .filter(Boolean)
    .join("\n");

  const mail = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM") ?? "Hebelie <onboarding@resend.dev>",
      to: [clinic.lead_email],
      subject: `New lead – ${lead.name}`,
      text,
    }),
  });

  if (!mail.ok) {
    console.error("notify-lead resend", await mail.text());
    return json({ sent: false, reason: "send_failed" }, 502);
  }

  return json({ sent: true });
});
