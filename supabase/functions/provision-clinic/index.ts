import { createClient } from "npm:@supabase/supabase-js@2";

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

function slugify(name: string) {
  let s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "clinic";
}

async function uniqueSlug(admin: ReturnType<typeof createClient>, base: string) {
  let slug = base;
  for (let n = 0; n < 20; n++) {
    const { data } = await admin.from("clinics").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${n + 2}`;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
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

  let clinic_name: string;
  let lead_email: string | undefined;
  let billing_country: string;
  let billing_region: string | null;
  try {
    const body = await req.json();
    clinic_name = String(body?.clinic_name ?? "").trim();
    lead_email = body?.lead_email ? String(body.lead_email).trim() : undefined;
    billing_country = String(body?.billing_country ?? "CA").trim().toUpperCase();
    billing_region = body?.billing_region ? String(body.billing_region).trim() : null;
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  if (clinic_name.length < 2) return json({ error: "invalid_name" }, 400);
  if (!/^[A-Z]{2}$/.test(billing_country)) return json({ error: "invalid_country" }, 400);
  if (billing_region && billing_region.length > 80) billing_region = billing_region.slice(0, 80);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: existingMember } = await admin
    .from("clinic_members")
    .select("clinic_id")
    .eq("user_id", userData.user.id)
    .limit(1)
    .maybeSingle();

  if (existingMember?.clinic_id) {
    const { data: clinic } = await admin
      .from("clinics")
      .select("slug, name")
      .eq("id", existingMember.clinic_id)
      .maybeSingle();
    return json({
      clinic_id: existingMember.clinic_id,
      slug: clinic?.slug,
      name: clinic?.name,
      already: true,
    });
  }

  const email = lead_email || userData.user.email;
  if (!email) return json({ error: "email_required" }, 400);

  const slug = await uniqueSlug(admin, slugify(clinic_name));
  const { data: clinic, error: insErr } = await admin
    .from("clinics")
    .insert({
      slug,
      name: clinic_name,
      lead_email: email,
      billing_country,
      billing_region,
    })
    .select("id, slug, name")
    .single();

  if (insErr || !clinic) {
    console.error("provision-clinic insert", insErr?.message);
    return json({ error: "create_failed" }, 500);
  }

  const { error: memErr } = await admin.from("clinic_members").insert({
    clinic_id: clinic.id,
    user_id: userData.user.id,
  });

  if (memErr) {
    console.error("provision-clinic member", memErr.message);
    return json({ error: "member_failed" }, 500);
  }

  return json({ clinic_id: clinic.id, slug: clinic.slug, name: clinic.name });
});
