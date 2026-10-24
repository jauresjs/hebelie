import { CONFIG } from "../config.js";
import { getSession, onAuth, redirectTo, supabase } from "./supabase.js?v=12";

const $ = (s) => document.querySelector(s);

if (CONFIG.siteUrl) {
  try {
    const home = new URL(CONFIG.siteUrl);
    if (location.hostname !== home.hostname) {
      location.replace(home.origin + location.pathname + location.search);
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function refreshUI(session) {
  const out = $("#signedOut");
  const inn = $("#signedIn");
  if (!session) {
    out.hidden = false;
    inn.hidden = true;
    return;
  }
  out.hidden = true;
  inn.hidden = false;

  const { data: clinics, error } = await supabase.rpc("get_my_clinics");
  if (error) {
    $("#clinicLabel").textContent = error.message;
    renderLeads([]);
    return;
  }
  if (!clinics?.length) {
    $("#clinicLabel").textContent =
      "No clinic linked to this account. Ask Hebelie to add your user to clinic_members.";
    renderLeads([]);
    return;
  }
  $("#clinicLabel").textContent = clinics.map((c) => c.name).join(" · ");
  const rows = await loadLeads(clinics.map((c) => c.id));
  renderLeads(rows);
}

async function signInOAuth(provider, scopes) {
  $("#dashAuthMsg").textContent = "";
  const options = { redirectTo: redirectTo() };
  if (scopes) options.scopes = scopes;
  const { error } = await supabase.auth.signInWithOAuth({ provider, options });
  if (error) $("#dashAuthMsg").textContent = error.message;
}

$("#dashGoogle").onclick = () => signInOAuth("google");
$("#dashFacebook").onclick = () => signInOAuth("facebook", "email");

$("#dashEmail").onsubmit = async (e) => {
  e.preventDefault();
  $("#dashAuthMsg").textContent = "";
  const email = $("#dashEmailInput").value.trim();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo() },
  });
  $("#dashAuthMsg").textContent = error ? error.message : "Check your email for a sign-in link.";
};

$("#signOut").onclick = async () => {
  await supabase.auth.signOut();
};

onAuth(refreshUI);
refreshUI(await getSession());
