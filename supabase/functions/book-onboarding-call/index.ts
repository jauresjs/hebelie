import { DateTime } from "npm:luxon@3";
import { escapeHtml, renderHebelieEmail, sendResendEmail } from "../_shared/hebelie-email.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TZ = "America/Toronto";
const WORK_START = 9;
const WORK_END = 17;
const SLOT_MIN = 30;
const MIN_LEAD_HOURS = 24;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function parseSlot(date: string, time: string): DateTime | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  if (h < WORK_START || h * 60 + m >= WORK_END * 60) return null;
  if (m % SLOT_MIN !== 0) return null;
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: TZ });
  if (!dt.isValid) return null;
  if (dt.weekday > 5) return null;
  const minStart = DateTime.now().setZone(TZ).plus({ hours: MIN_LEAD_HOURS });
  if (dt < minStart) return null;
  return dt;
}

function formatSlot(dt: DateTime, locale: string) {
  return dt.setLocale(locale === "fr" ? "fr-CA" : "en-CA").toFormat("cccc d LLLL yyyy · h:mm a ZZZZ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: {
    name?: string;
    clinic?: string;
    email?: string;
    note?: string;
    date?: string;
    time?: string;
    timezone?: string;
    locale?: string;
    company?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  if (payload.company) return json({ ok: true });

  const name = String(payload.name ?? "").trim();
  const clinic = String(payload.clinic ?? "").trim();
  const email = String(payload.email ?? "").trim().toLowerCase();
  const note = String(payload.note ?? "").trim();
  const date = String(payload.date ?? "");
  const time = String(payload.time ?? "");
  const locale = payload.locale === "fr" ? "fr" : "en";

  if (name.length < 2 || clinic.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "invalid_fields" }, 400);
  }

  const slot = parseSlot(date, time);
  if (!slot) return json({ error: "invalid_slot" }, 400);

  const when = formatSlot(slot, locale);
  const internalTo = Deno.env.get("ONBOARDING_CALL_EMAIL") ?? "contact@hebelie.com";

  const internalHtml = renderHebelieEmail({
    preheader: `${clinic} · ${when}`,
    kicker: "Call request",
    title: "New clinic intro call",
    bodyHtml: `<p style="margin:0 0 12px"><strong>${escapeHtml(name)}</strong> · ${escapeHtml(clinic)}</p>
<p style="margin:0 0 12px"><a href="mailto:${escapeHtml(email)}" style="color:#141412">${escapeHtml(email)}</a></p>
<p style="margin:0 0 12px"><strong>Requested:</strong> ${escapeHtml(when)}</p>
${note ? `<p style="margin:0;color:#6E6A63">${escapeHtml(note)}</p>` : ""}`,
  });

  const confirmTitle = locale === "fr" ? "Votre appel est demandé" : "Your call is requested";
  const confirmKicker = locale === "fr" ? "Hebelie · Cliniques" : "Hebelie · Clinics";
  const confirmBody =
    locale === "fr"
      ? `<p style="margin:0 0 12px">Merci, <strong>${escapeHtml(name)}</strong>. Nous avons reçu votre demande pour <strong>${escapeHtml(when)}</strong>.</p>
<p style="margin:0">Nous vous écrirons à <strong>${escapeHtml(email)}</strong> pour confirmer ou proposer un autre créneau.</p>`
      : `<p style="margin:0 0 12px">Thanks, <strong>${escapeHtml(name)}</strong>. We received your request for <strong>${escapeHtml(when)}</strong>.</p>
<p style="margin:0">We’ll email <strong>${escapeHtml(email)}</strong> to confirm or suggest another time.</p>`;

  const confirmHtml = renderHebelieEmail({
    preheader: when,
    kicker: confirmKicker,
    title: confirmTitle,
    bodyHtml: confirmBody,
    cta: { label: locale === "fr" ? "Retour au site" : "Back to site", href: "https://hebelie.com/" },
  });

  const subjectInternal = `Call request: ${clinic} · ${slot.toFormat("MMM d, h:mm a")}`;
  const subjectGuest =
    locale === "fr"
      ? `Hebelie — demande d’appel · ${slot.toFormat("d LLL, h:mm a")}`
      : `Hebelie — call requested · ${slot.toFormat("MMM d, h:mm a")}`;

  const textInternal = `${name} · ${clinic}\n${email}\n${when}\n${note}`;
  const textGuest =
    locale === "fr"
      ? `Merci ${name}. Créneau demandé : ${when}. Nous vous contacterons à ${email}.`
      : `Thanks ${name}. Requested: ${when}. We will reach you at ${email}.`;

  const internal = await sendResendEmail({
    to: [internalTo],
    subject: subjectInternal,
    text: textInternal,
    html: internalHtml,
  });
  if (!internal.ok) {
    console.error("book-onboarding-call internal", internal.detail);
    return json({ error: "mail_failed" }, 502);
  }

  await sendResendEmail({
    to: [email],
    subject: subjectGuest,
    text: textGuest,
    html: confirmHtml,
  });

  return json({ ok: true });
});
