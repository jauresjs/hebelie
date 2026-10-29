import { createClient } from "npm:@supabase/supabase-js@2";
import { buildLeadEmailContent, sendResendEmail } from "../_shared/hebelie-email.ts";

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
    .select("id, name, email, phone, treatments, user_id, clinic_id, preview_id, before_url, after_url")
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr || !lead || lead.user_id !== userData.user.id) {
    return json({ error: "not_found" }, 404);
  }

  if (!lead.clinic_id) return json({ sent: false, reason: "no_clinic" });

  const { data: clinic } = await admin
    .from("clinics")
    .select("name, lead_email, notify_lead_email")
    .eq("id", lead.clinic_id)
    .maybeSingle();

  if (!clinic?.lead_email) return json({ sent: false, reason: "no_email" });
  if (clinic.notify_lead_email === false) return json({ sent: false, reason: "opted_out" });

  if (!Deno.env.get("RESEND_API_KEY")) {
    console.log("notify-lead: no RESEND_API_KEY", lead.id, clinic.lead_email);
    return json({ sent: false, reason: "mail_not_configured" });
  }

  const treatments = Array.isArray(lead.treatments) ? lead.treatments.join(", ") : "";
  let beforeLink: string | null = null;
  let afterLink: string | null = null;
  const pathBefore = lead.before_url as string | null;
  const pathAfter = lead.after_url as string | null;
  if (pathBefore && !/^https?:\/\//i.test(pathBefore)) {
    const { data } = await admin.storage.from("clinic-leads").createSignedUrl(pathBefore, 604800);
    beforeLink = data?.signedUrl ?? null;
  } else beforeLink = pathBefore;
  if (pathAfter && !/^https?:\/\//i.test(pathAfter)) {
    const { data } = await admin.storage.from("clinic-leads").createSignedUrl(pathAfter, 604800);
    afterLink = data?.signedUrl ?? null;
  } else afterLink = pathAfter;

  const { subject, text, html } = buildLeadEmailContent({
    clinicName: clinic.name,
    kind: "consultation",
    leadName: lead.name,
    leadEmail: lead.email,
    phone: lead.phone,
    treatments,
    beforeUrl: beforeLink,
    afterUrl: afterLink,
  });

  const sent = await sendResendEmail({
    to: [clinic.lead_email],
    subject,
    text,
    html,
  });

  if (!sent.ok) {
    console.error("notify-lead resend", sent.detail);
    return json({ sent: false, reason: "send_failed" }, 502);
  }

  return json({ sent: true });
});
