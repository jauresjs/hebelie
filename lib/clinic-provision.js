import { peekAuthIntent } from "./auth-intent.js";
import { pageLocaleFromDocument } from "./i18n.js?v=33";
import { supabase } from "./supabase.js?v=19";

/**
 * @param {import("@supabase/supabase-js").Session} session
 * @returns {{ role: "pro" | "user", clinicName?: string, billingCountry?: string, billingRegion?: string }}
 */
export function resolveLoginContext(session, { frozenAsProfessional = false } = {}) {
  const intent = peekAuthIntent();
  const meta = session.user?.user_metadata ?? {};
  const asParam = new URLSearchParams(location.search).get("as");
  const isPro =
    intent?.role === "pro" ||
    meta.hebelie_role === "pro" ||
    asParam === "professional" ||
    frozenAsProfessional;

  if (isPro) {
    return {
      role: "pro",
      clinicName: intent?.clinicName || meta.clinic_name || "",
      billingCountry: intent?.billingCountry || meta.billing_country || "CA",
      billingRegion: intent?.billingRegion || meta.billing_region || "",
    };
  }
  if (intent?.role === "user" || meta.hebelie_role === "user") {
    return { role: "user" };
  }
  return { role: "user" };
}

/**
 * Create clinic row on first pro signup when metadata or intent includes clinic name.
 * @param {import("@supabase/supabase-js").Session} session
 * @param {{ clinicName?: string, billingCountry?: string, billingRegion?: string }} ctx
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function ensureClinicForSession(session, ctx) {
  if (!supabase || !session?.user?.email) {
    return { ok: false, error: "no_session" };
  }
  const clinicName = (ctx.clinicName || "").trim();
  if (clinicName.length < 2) {
    return { ok: true };
  }

  const pageLoc = pageLocaleFromDocument();
  const { data, error } = await supabase.functions.invoke("provision-clinic", {
    body: {
      clinic_name: clinicName,
      lead_email: session.user.email,
      billing_country: ctx.billingCountry || "CA",
      billing_region: ctx.billingRegion || null,
      embed_locale: pageLoc === "fr" ? "fr" : "en",
    },
  });
  if (error || data?.error) {
    return { ok: false, error: data?.error || error?.message || "provision_failed" };
  }
  return { ok: true };
}
