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

function logLookupError(
  scope: string,
  error: { code?: string; message?: string; details?: string; hint?: string },
) {
  console.error(
    "recent lead lookup",
    scope,
    error.code ?? "",
    error.message ?? "",
    error.details ?? "",
    error.hint ?? "",
  );
}

async function recentLead(
  admin: SupabaseClient,
  clinicId: string,
  column: "user_id" | "email",
  value: string,
  since: string,
): Promise<{ id: string | null; failed: boolean }> {
  const filtered = await admin
    .from("atelier_leads")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq(column, value)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(1);
  if (filtered.error) {
    logLookupError(column, filtered.error);
    return { id: null, failed: true };
  }
  const filteredId = filtered.data?.[0]?.id;
  if (filteredId) return { id: filteredId, failed: false };

  // gte missed. Read the newest row for the same column and apply the window in JS
  // so a bad timestamp filter cannot hide a lead from the last few minutes.
  const newest = await admin
    .from("atelier_leads")
    .select("id, created_at")
    .eq("clinic_id", clinicId)
    .eq(column, value)
    .order("created_at", { ascending: false })
    .limit(1);
  if (newest.error) {
    logLookupError(`${column}:newest`, newest.error);
    return { id: null, failed: true };
  }
  const row = newest.data?.[0];
  if (!row?.id) {
    console.log("recent lead lookup", column, "rows:0", since);
    return { id: null, failed: false };
  }
  const ts = Date.parse(row.created_at ?? "");
  const sinceMs = Date.parse(since);
  console.log("recent lead lookup", column, "gte-miss", row.id, row.created_at ?? "", since);
  if (Number.isFinite(ts) && Number.isFinite(sinceMs) && ts >= sinceMs) {
    return { id: row.id, failed: false };
  }
  return { id: null, failed: false };
}

async function findRecentLeadId(
  admin: SupabaseClient,
  clinicId: string,
  userId: string,
  email: string,
): Promise<{ id: string | null; failed: boolean }> {
  const since = new Date(Date.now() - LEAD_DEDUPE_MS).toISOString();
  const byUser = await recentLead(admin, clinicId, "user_id", userId, since);
  if (byUser.id) return byUser;
  const byEmail = await recentLead(admin, clinicId, "email", email, since);
  if (byEmail.id) return byEmail;
  // A failed user_id read must not be treated as "no lead".
  if (byUser.failed) return { id: null, failed: true };
  return { id: null, failed: false };
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

  const existing = await findRecentLeadId(admin, opts.clinicId, opts.user.id, email);
  if (existing.failed) {
    console.error("recent lead lookup failed; not inserting another lead");
    return { leadId: null, emailSent: false, created: false };
  }
  if (existing.id) {
    await attachPreviewToLead(admin, existing.id, opts);
    return { leadId: existing.id, emailSent: false, created: false };
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
  const winner = await findRecentLeadId(admin, opts.clinicId, opts.user.id, email);
  if (winner.failed) {
    console.error("recent lead lookup failed after insert; not sending another clinic email");
    return { leadId: lead.id, emailSent: false, created: false };
  }
  if (winner.id && winner.id !== lead.id) {
    await attachPreviewToLead(admin, winner.id, opts);
    const { error: delErr } = await admin.from("atelier_leads").delete().eq("id", lead.id);
    if (delErr) console.error("duplicate lead delete", delErr);
    return { leadId: winner.id, emailSent: false, created: false };
  }

  const mailed = await emailClinicAboutLead(admin, { leadId: lead.id, kind: "preview" });
  return { leadId: lead.id, emailSent: mailed.ok, created: true };
}
