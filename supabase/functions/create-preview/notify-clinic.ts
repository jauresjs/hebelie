import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { signedImageUrl } from "./storage.ts";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.log("create-preview: no RESEND_API_KEY for lead", lead.id);
    return { leadId: lead.id, emailSent: false };
  }

  const treatmentLine = opts.treatments?.length ? opts.treatments.join(", ") : "";
  const beforeLink = opts.beforePath ? await signedImageUrl(admin, opts.beforePath) : null;
  const afterLink = opts.afterPath ? await signedImageUrl(admin, opts.afterPath) : null;

  const text = [
    `New preview lead for ${clinic.name}`,
    "",
    "A patient completed a treatment preview on your embed.",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    treatmentLine ? `Treatments explored: ${treatmentLine}` : "",
    beforeLink ? `Before photo: ${beforeLink}` : "",
    afterLink ? `After preview: ${afterLink}` : "",
    "",
    "Open your Hebelie dashboard to view leads and images.",
    "",
    "Sent via Hebelie.",
  ]
    .filter(Boolean)
    .join("\n");

  const htmlParts = [
    `<p>New preview lead for <strong>${escapeHtml(clinic.name)}</strong>.</p>`,
    `<p><strong>Name:</strong> ${escapeHtml(name)}<br>`,
    `<strong>Email:</strong> ${escapeHtml(email)}</p>`,
    treatmentLine
      ? `<p><strong>Treatments:</strong> ${escapeHtml(treatmentLine)}</p>`
      : "",
    beforeLink && afterLink
      ? `<p><strong>Before / after</strong></p><p><a href="${beforeLink}">Before</a> · <a href="${afterLink}">After preview</a></p>`
      : "",
    `<p>Follow up to book a consultation. View all leads in your Hebelie dashboard.</p>`,
  ].join("");

  const mail = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM") ?? "Hebelie <onboarding@resend.dev>",
      to: [clinic.lead_email],
      subject: `New preview lead – ${name}`,
      text,
      html: htmlParts,
    }),
  });

  if (!mail.ok) {
    console.error("create-preview notify resend", await mail.text());
    return { leadId: lead.id, emailSent: false };
  }

  return { leadId: lead.id, emailSent: true };
}
