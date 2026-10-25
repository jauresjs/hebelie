import { CONFIG } from "../config.js";
import { getSession, onAuth, supabase, waitForSession } from "./supabase.js?v=16";

const $ = (s) => document.querySelector(s);

if (CONFIG.siteUrl) {
  try {
    const home = new URL(CONFIG.siteUrl);
    if (location.hostname !== home.hostname) {
      location.replace(home.origin + location.pathname + location.search + location.hash);
    }
  } catch {
    /* ignore */
  }
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function authPendingInUrl() {
  const q = new URLSearchParams(location.search);
  return (
    q.has("from_auth") ||
    q.has("code") ||
    q.has("token_hash") ||
    /access_token|refresh_token/.test(location.hash)
  );
}

function stripDashboardAuthParams() {
  const u = new URL(location.href);
  u.searchParams.delete("from_auth");
  u.searchParams.delete("code");
  u.searchParams.delete("token_hash");
  u.hash = "";
  history.replaceState(null, "", u.pathname + u.search);
}

async function resolveSession() {
  let session = await getSession();
  if (session) return session;
  const waitMs = authPendingInUrl() ? 15000 : 2500;
  return waitForSession(waitMs);
}

async function loadLeads(clinicIds) {
  if (!clinicIds.length) return [];
  const { data, error } = await supabase
    .from("atelier_leads")
    .select("created_at, name, email, phone, treatments")
    .in("clinic_id", clinicIds)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

function renderLeads(rows) {
  const tbody = $("#leadRows");
  const empty = $("#noLeads");
  tbody.innerHTML = "";
  if (!rows.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  tbody.innerHTML = rows
    .map(
      (r) => `<tr>
<td>${fmtDate(r.created_at)}</td>
<td>${escapeHtml(r.name)}</td>
<td>${escapeHtml(r.email)}${r.phone ? `<br>${escapeHtml(r.phone)}` : ""}</td>
<td>${escapeHtml((r.treatments || []).join(", "))}</td>
</tr>`
    )
    .join("");
}

async function refreshUI(session) {
  if (!session) {
    location.href = "./auth.html?as=professional";
    return;
  }

  const { data: clinics, error } = await supabase.rpc("get_my_clinics");
  if (error) {
    $("#clinicLabel").textContent = error.message;
    renderLeads([]);
    return;
  }
  if (!clinics?.length) {
    $("#clinicLabel").textContent =
      "No clinic on this account yet. Complete professional sign-up to create one.";
    renderLeads([]);
    return;
  }

  $("#clinicLabel").textContent = clinics.map((c) => c.name).join(" · ");
  const primary = clinics[0];
  if (primary?.slug) {
    const url = `${location.origin}/c/${primary.slug}`;
    $("#embedUrl").textContent = url;
    $("#embedHint").hidden = false;
  }

  const rows = await loadLeads(clinics.map((c) => c.id));
  renderLeads(rows);
}

$("#signOut").onclick = async () => {
  await supabase.auth.signOut();
  location.href = "./auth.html?as=professional";
};

onAuth((session) => {
  if (session) void refreshUI(session);
});

async function boot() {
  const session = await resolveSession();
  if (!session) {
    location.href = "./auth.html?as=professional";
    return;
  }
  stripDashboardAuthParams();
  await refreshUI(session);
}

boot();
