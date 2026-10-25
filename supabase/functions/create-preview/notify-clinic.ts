import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

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
  },
): Promise<{ leadId: string | null; emailSent: boolean }> {
  const { data: clinic } = await admin
    .from("clinics")
    .select("name, lead_email")
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
    })
    .select("id")
    .single();

  if (leadErr || !lead?.id) {
    console.error("auto lead insert", leadErr?.message);
    return { leadId: null, emailSent: false };
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.log("create-preview: no RESEND_API_KEY for lead", lead.id);
    return { leadId: lead.id, emailSent: false };
  }

  const treatmentLine = opts.treatments?.length ? opts.treatments.join(", ") : "";
  const text = [
    `New preview lead for ${clinic.name}`,
    "",
    "A patient completed a treatment preview on your embed.",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    treatmentLine ? `Treatments explored: ${treatmentLine}` : "",
    "",
    "Follow up to book a consultation.",
    "",
    "Sent via Hebelie.",
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
      subject: `New preview lead – ${name}`,
      text,
    }),
  });

  if (!mail.ok) {
    console.error("create-preview notify resend", await mail.text());
    return { leadId: lead.id, emailSent: false };
  }

  return { leadId: lead.id, emailSent: true };
}
