import { CONFIG } from "../config.js";
import { getSession, onAuth, supabase, waitForSession } from "./supabase.js?v=18";

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

const siteOrigin = (() => {
  try {
    return CONFIG.siteUrl ? new URL(CONFIG.siteUrl).origin : location.origin;
  } catch {
    return location.origin;
  }
})();

/** @type {Array<Record<string, unknown>>} */
let clinics = [];
let activeClinicId = null;

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

function activeClinic() {
  return clinics.find((c) => c.id === activeClinicId) ?? clinics[0] ?? null;
}

function normalizeHex(v, fallback) {
  const s = String(v || "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s;
  return fallback;
}

function readFormSettings() {
  return {
    website_url: $("#websiteUrl").value.trim(),
    booking_url: $("#bookingUrl").value.trim(),
    embed_button_label: $("#buttonLabel").value.trim() || "Preview treatments",
    embed_button_bg: normalizeHex($("#buttonBgHex").value, "#9A8565"),
    embed_button_text: normalizeHex($("#buttonTextHex").value, "#FFFFFF"),
  };
}

function applySettingsToForm(c) {
  if (!c) return;
  $("#websiteUrl").value = c.website_url ?? "";
  $("#bookingUrl").value = c.booking_url ?? "";
  $("#buttonLabel").value = c.embed_button_label ?? "Preview treatments";
  const bg = normalizeHex(c.embed_button_bg ?? c.accent_color, "#9A8565");
  const fg = normalizeHex(c.embed_button_text, "#FFFFFF");
  $("#buttonBg").value = bg;
  $("#buttonBgHex").value = bg;
  $("#buttonText").value = fg;
  $("#buttonTextHex").value = fg;
  updatePreview();
  updateSnippet();
}

function updatePreview() {
  const s = readFormSettings();
  const btn = $("#buttonPreview");
  btn.textContent = s.embed_button_label;
  btn.style.background = s.embed_button_bg;
  btn.style.color = s.embed_button_text;
  btn.style.border = "0";
  btn.style.padding = "14px 28px";
  btn.style.fontFamily = "system-ui, sans-serif";
  btn.style.fontSize = "15px";
  btn.style.cursor = "pointer";
  btn.style.letterSpacing = "0.02em";
}

function embedPreviewUrl(slug) {
  return `${siteOrigin}/c/${encodeURIComponent(slug)}`;
}

function buildSnippet(c, settings) {
  const slug = c?.slug;
  if (!slug) return "";
  const url = embedPreviewUrl(slug);
  const label = escapeHtml(settings.embed_button_label);
  const bg = settings.embed_button_bg;
  const fg = settings.embed_button_text;
  return `<button type="button"
  onclick="window.open('${url}','hebelie','width=440,height=920,noopener,noreferrer')"
  style="background:${bg};color:${fg};border:0;padding:14px 28px;font-family:system-ui,sans-serif;font-size:15px;cursor:pointer;letter-spacing:0.02em;">
  ${label}
</button>`;
}

function updateSnippet() {
  const c = activeClinic();
  const settings = readFormSettings();
  const code = buildSnippet(c, settings);
  $("#snippetCode").value = code;
  if (c?.slug) {
    const previewUrl = embedPreviewUrl(c.slug);
    $("#testEmbed").href = previewUrl;
    $("#iframeUrl").textContent = previewUrl;
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

function renderClinicSelect() {
  const sel = $("#clinicSelect");
  if (clinics.length <= 1) {
    sel.hidden = true;
    return;
  }
  sel.hidden = false;
  sel.innerHTML = clinics
    .map(
      (c) =>
        `<option value="${c.id}"${c.id === activeClinicId ? " selected" : ""}>${escapeHtml(c.name)}</option>`
    )
    .join("");
}

function selectTab(leads) {
  $("#tabLeads").setAttribute("aria-selected", leads ? "true" : "false");
  $("#tabEmbed").setAttribute("aria-selected", leads ? "false" : "true");
  $("#panelLeads").hidden = !leads;
  $("#panelEmbed").hidden = leads;
}

$("#tabLeads").onclick = () => selectTab(true);
$("#tabEmbed").onclick = () => selectTab(false);

$("#clinicSelect").onchange = async () => {
  activeClinicId = $("#clinicSelect").value;
  applySettingsToForm(activeClinic());
  updateSnippet();
  const rows = await loadLeads([activeClinicId]);
  renderLeads(rows);
};

function syncColorPickers(fromPicker) {
  if (fromPicker === "bg") {
    $("#buttonBgHex").value = $("#buttonBg").value;
  } else if (fromPicker === "bgHex") {
    const v = normalizeHex($("#buttonBgHex").value, "#9A8565");
    $("#buttonBg").value = v;
    $("#buttonBgHex").value = v;
  } else if (fromPicker === "text") {
    $("#buttonTextHex").value = $("#buttonText").value;
  } else if (fromPicker === "textHex") {
    const v = normalizeHex($("#buttonTextHex").value, "#FFFFFF");
    $("#buttonText").value = v;
    $("#buttonTextHex").value = v;
  }
  updatePreview();
  updateSnippet();
}

["websiteUrl", "bookingUrl", "buttonLabel"].forEach((id) => {
  $("#" + id)?.addEventListener("input", () => {
    updatePreview();
    updateSnippet();
  });
});

$("#buttonBg").oninput = () => syncColorPickers("bg");
$("#buttonBgHex").oninput = () => syncColorPickers("bgHex");
$("#buttonText").oninput = () => syncColorPickers("text");
$("#buttonTextHex").oninput = () => syncColorPickers("textHex");

$("#buttonPreview").onclick = () => {
  const c = activeClinic();
  if (c?.slug) window.open(embedPreviewUrl(c.slug), "hebelie", "width=440,height=920,noopener,noreferrer");
};

$("#settingsForm").onsubmit = async (e) => {
  e.preventDefault();
  const c = activeClinic();
  const msg = $("#settingsMsg");
  msg.textContent = "";
  msg.classList.remove("ok");
  if (!c?.id) return;

  const s = readFormSettings();
  const { data, error } = await supabase.rpc("update_my_clinic", {
    p_clinic_id: c.id,
    p_website_url: s.website_url || null,
    p_booking_url: s.booking_url || null,
    p_embed_button_label: s.embed_button_label,
    p_embed_button_bg: s.embed_button_bg,
    p_embed_button_text: s.embed_button_text,
  });

  if (error) {
    msg.textContent = error.message.includes("forbidden")
      ? "You cannot edit this clinic."
      : error.message;
    return;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row) {
    const idx = clinics.findIndex((x) => x.id === c.id);
    if (idx >= 0) clinics[idx] = { ...clinics[idx], ...row, ...s };
  }

  msg.textContent = "Settings saved.";
  msg.classList.add("ok");
  updateSnippet();
};

$("#copySnippet").onclick = async () => {
  const text = $("#snippetCode").value;
  try {
    await navigator.clipboard.writeText(text);
    $("#settingsMsg").textContent = "Embed code copied.";
    $("#settingsMsg").classList.add("ok");
  } catch {
    $("#snippetCode").select();
    document.execCommand("copy");
  }
};

async function refreshUI(session) {
  if (!session) {
    location.href = "./auth.html?as=professional";
    return;
  }

  const { data, error } = await supabase.rpc("get_my_clinics");
  if (error) {
    $("#clinicLabel").textContent = error.message;
    renderLeads([]);
    return;
  }
  clinics = data ?? [];
  if (!clinics.length) {
    $("#clinicLabel").textContent =
      "No clinic on this account yet. Complete professional sign-up to create one.";
    renderLeads([]);
    return;
  }

  if (!activeClinicId || !clinics.some((c) => c.id === activeClinicId)) {
    activeClinicId = clinics[0].id;
  }

  $("#clinicLabel").textContent = clinics.map((c) => c.name).join(" · ");
  renderClinicSelect();
  applySettingsToForm(activeClinic());
  updateSnippet();

  const filterIds =
    clinics.length > 1 && activeClinicId ? [activeClinicId] : clinics.map((c) => c.id);
  const rows = await loadLeads(filterIds);
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
