import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { emailClinicAboutLead } from "../_shared/clinic-lead-notify.ts";

const LEAD_DEDUPE_MS = 10 * 60 * 1000;

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

async function findRecentLeadId(
  admin: SupabaseClient,
  clinicId: string,
  userId: string,
  email: string,
): Promise<string | null> {
  const since = new Date(Date.now() - LEAD_DEDUPE_MS).toISOString();
  const byUser = await admin
    .from("atelier_leads")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (byUser.error) console.error("recent lead lookup", byUser.error.message);
  if (byUser.data?.id) return byUser.data.id;

  const emailPattern = email.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const byEmail = await admin
    .from("atelier_leads")
    .select("id")
    .eq("clinic_id", clinicId)
    .ilike("email", emailPattern)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (byEmail.error) console.error("recent lead lookup", byEmail.error.message);
  return byEmail.data?.id ?? null;
}

async function attachPreviewToLead(
  admin: SupabaseClient,
  leadId: string,
  opts: {
    previewId: string | null;
    treatments: string[];
    beforePath: string | null;
    afterPath: string | null;
  },
) {
  const patch: {
    preview_id?: string;
    treatments?: string[];
    before_url?: string;
    after_url?: string;
  } = {};
  if (opts.previewId) patch.preview_id = opts.previewId;
  if (opts.treatments.length) patch.treatments = opts.treatments;
  if (opts.beforePath) patch.before_url = opts.beforePath;
  if (opts.afterPath) patch.after_url = opts.afterPath;
  if (!Object.keys(patch).length) return;

  const { error } = await admin.from("atelier_leads").update(patch).eq("id", leadId);
  if (error) console.error("reuse lead update", error.message);
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
): Promise<{ leadId: string | null; emailSent: boolean; created: boolean }> {
  const { data: clinic } = await admin
    .from("clinics")
    .select("name, lead_email, notify_lead_email")
    .eq("id", opts.clinicId)
    .maybeSingle();

  if (!clinic?.lead_email) return { leadId: null, emailSent: false, created: false };

  const name = leadName(opts.user);
  const email = opts.user.email ?? "";
  if (!email) return { leadId: null, emailSent: false, created: false };

  const existingId = await findRecentLeadId(admin, opts.clinicId, opts.user.id, email);
  if (existingId) {
    await attachPreviewToLead(admin, existingId, opts);
    return { leadId: existingId, emailSent: false, created: false };
  }

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
    return { leadId: null, emailSent: false, created: false };
  }

  // Overlapping requests can both pass the pre-insert lookup. Keep the earliest
  // lead in the window, attach this preview to it, and do not send a second email.
  const winnerId = await findRecentLeadId(admin, opts.clinicId, opts.user.id, email);
  if (winnerId && winnerId !== lead.id) {
    await attachPreviewToLead(admin, winnerId, opts);
    const { error: delErr } = await admin.from("atelier_leads").delete().eq("id", lead.id);
    if (delErr) console.error("duplicate lead delete", delErr.message);
    return { leadId: winnerId, emailSent: false, created: false };
  }

  const mailed = await emailClinicAboutLead(admin, { leadId: lead.id, kind: "preview" });
  return { leadId: lead.id, emailSent: mailed.ok, created: true };
}
