import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { buildLeadEmailContent, sendResendEmail } from "../_shared/hebelie-email.ts";
import { signedImageUrl } from "./storage.ts";

function leadName(user: User) {
  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    "";
  if (name) return name;
  const email = user.email ?? "";
  const local = email.split("@")[0];
  return local || "Patient";
}

export async function createLeadAndNotifyClinic(
  admin: SupabaseClient,
  opts: {
    user: User;
    clinicId: string;
    previewId: string | null;
    treatments: string[];
    beforePath: string | null;
    afterPath: string | null;
  },
): Promise<{ leadId: string | null; emailSent: boolean }> {
  const { data: clinic } = await admin
    .from("clinics")
    .select("name, lead_email, notify_lead_email")
    .eq("id", opts.clinicId)
    .maybeSingle();

  if (!clinic?.lead_email) return { leadId: null, emailSent: false };

  const name = leadName(opts.user);
  const email = opts.user.email ?? "";
  if (!email) return { leadId: null, emailSent: false };

  const { data: lead, error: leadErr } = await admin
    .from("atelier_leads")
    .insert({
      user_id: opts.user.id,
      preview_id: opts.previewId,
      clinic_id: opts.clinicId,
      name,
      email,
      phone: null,
      treatments: opts.treatments,
      before_url: opts.beforePath,
      after_url: opts.afterPath,
    })
    .select("id")
    .single();

  if (leadErr || !lead?.id) {
    console.error("auto lead insert", leadErr?.message);
    return { leadId: null, emailSent: false };
  }

  if (clinic.notify_lead_email === false) {
    return { leadId: lead.id, emailSent: false };
  }

  if (!Deno.env.get("RESEND_API_KEY")) {
    console.log("create-preview: no RESEND_API_KEY for lead", lead.id);
    return { leadId: lead.id, emailSent: false };
  }

  const treatmentLine = opts.treatments?.length ? opts.treatments.join(", ") : "";
  const beforeLink = opts.beforePath ? await signedImageUrl(admin, opts.beforePath) : null;
  const afterLink = opts.afterPath ? await signedImageUrl(admin, opts.afterPath) : null;

  const { subject, text, html } = buildLeadEmailContent({
    clinicName: clinic.name,
    kind: "preview",
    leadName: name,
    leadEmail: email,
    treatments: treatmentLine,
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
    console.error("create-preview notify resend", sent.detail);
    return { leadId: lead.id, emailSent: false };
  }

  return { leadId: lead.id, emailSent: true };
}
