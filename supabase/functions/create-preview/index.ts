import { createClient } from "npm:@supabase/supabase-js@2";
import { createLeadAndNotifyClinic } from "./notify-clinic.ts";
import { buildRequest } from "./prompts.js";

const QUEUE = "https://queue.fal.run";
const MODEL = "fal-ai/nano-banana/edit";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function falCall(url: string, key: string) {
  const r = await fetch(url, { headers: { Authorization: `Key ${key}` } });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

function falKind(status: number, data: unknown) {
  const detail = (data as { detail?: { type?: string }[] })?.detail;
  if (Array.isArray(detail) && detail.some((d) => d?.type === "content_policy_violation")) return "moderated";
  if (status === 401 || status === 403) return "auth";
  return "failed";
}

async function runFal(key: string, input: Record<string, unknown>) {
  const r = await fetch(`${QUEUE}/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const job = await r.json().catch(() => null);
  if (!r.ok || !job?.request_id) throw { kind: falKind(r.status, job), status: r.status };

  const started = Date.now();
  let delay = 1500;
  while (Date.now() - started < 95000) {
    await sleep(delay);
    delay = Math.min(Math.round(delay * 1.35), 3000);
    const s = await falCall(job.status_url, key);
    const status = s.data?.status;
    if (status === "COMPLETED") {
      const out = await falCall(job.response_url, key);
      const url = out.data?.images?.[0]?.url;
      if (!url) throw { kind: falKind(out.status, out.data), status: out.status };
      return url;
    }
    if (!s.ok || (status && status !== "IN_QUEUE" && status !== "IN_PROGRESS")) {
      throw { kind: falKind(s.status, s.data), status: s.status };
    }
  }
  throw { kind: "timeout", status: 0 };
}

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: auth } } },
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);

  const falKey = Deno.env.get("FAL_KEY");
  if (!falKey) return json({ error: "service_unavailable" }, 503);

  try {
    const { treatments, image, intensity, clinic_slug } = await req.json();
    const input = buildRequest(treatments, intensity ?? "strong", image, 1);
    const afterUrl = await runFal(falKey, input);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let clinic_id: string | null = null;
    let booking_url: string | null = null;
    if (clinic_slug && typeof clinic_slug === "string") {
      const slug = clinic_slug.trim().toLowerCase();
      const { data: clinicRow } = await admin
        .from("clinics")
        .select("id, booking_url")
        .eq("slug", slug)
        .eq("active", true)
        .maybeSingle();
      if (!clinicRow) return json({ error: "unknown_clinic" }, 400);
      clinic_id = clinicRow.id;
      booking_url = clinicRow.booking_url ?? null;
    }

    const { data: preview, error: dbErr } = await admin
      .from("atelier_previews")
      .insert({
        user_id: userData.user.id,
        treatments,
        intensity: intensity ?? "strong",
        after_url: afterUrl,
        clinic_id,
      })
      .select("id")
      .single();
    if (dbErr) console.error("atelier_previews insert", dbErr.message);

    let leadCreated = false;
    if (clinic_id && preview?.id) {
      const { leadId } = await createLeadAndNotifyClinic(admin, {
        user: userData.user,
        clinicId: clinic_id,
        previewId: preview.id,
        treatments: Array.isArray(treatments) ? treatments : [],
      });
      leadCreated = Boolean(leadId);
    }

    return json({
      afterUrl,
      previewId: preview?.id ?? null,
      bookingUrl: booking_url,
      leadCreated,
    });
  } catch (e) {
    if (e && typeof e === "object" && "kind" in e) {
      return json({ error: (e as { kind: string }).kind }, 502);
    }
    const msg = e instanceof Error ? e.message : "failed";
    const status = msg === "bad_image" || msg === "no_treatments" || msg.startsWith("unknown") ? 400 : 500;
    return json({ error: msg }, status);
  }
});
