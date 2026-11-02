import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildLeadEmailContent, sendResendEmail } from "./hebelie-email.ts";

const PREVIEW_BUCKET = "clinic-leads";

async function signedStorageUrl(admin: SupabaseClient, path: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = await admin.storage.from(PREVIEW_BUCKET).createSignedUrl(path, 604800);
  return data?.signedUrl ?? null;
}

export async function emailClinicAboutLead(
  admin: SupabaseClient,
  opts: {
    leadId: string;
    kind: "preview" | "consultation";
  },
): Promise<{ ok: boolean; reason?: string }> {
  const { data: lead, error: leadErr } = await admin
    .from("atelier_leads")
    .select("id, name, email, phone, treatments, clinic_id, before_url, after_url")
    .eq("id", opts.leadId)
    .maybeSingle();

  if (leadErr || !lead?.clinic_id) {
    return { ok: false, reason: "lead_not_found" };
  }

  const { data: clinic } = await admin
    .from("clinics")
    .select("name, lead_email, notify_lead_email")
    .eq("id", lead.clinic_id)
    .maybeSingle();

  if (!clinic?.lead_email) return { ok: false, reason: "no_clinic_email" };
  if (clinic.notify_lead_email === false) return { ok: false, reason: "opted_out" };

  if (!Deno.env.get("RESEND_API_KEY")) {
    console.log("clinic-lead-notify: no RESEND_API_KEY", opts.leadId, clinic.lead_email);
    return { ok: false, reason: "mail_not_configured" };
  }

  const treatments = Array.isArray(lead.treatments) ? lead.treatments.join(", ") : "";
  const beforeLink = await signedStorageUrl(admin, lead.before_url as string | null);
  const afterLink = await signedStorageUrl(admin, lead.after_url as string | null);

  const { subject, text, html } = buildLeadEmailContent({
    clinicName: clinic.name,
    kind: opts.kind,
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
    console.error("clinic-lead-notify resend", opts.kind, sent.detail);
    return { ok: false, reason: "send_failed", detail: sent.detail };
  }

  return { ok: true };
}
