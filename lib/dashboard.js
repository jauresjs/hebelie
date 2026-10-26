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
    notify_lead_email: $("#notifyLeadEmail").checked,
    embed_auto_prompt: $("#embedAutoPrompt").checked,
    embed_button_label: $("#buttonLabel").value.trim() || "Preview treatments",
    embed_button_bg: normalizeHex($("#buttonBgHex").value, "#9A8565"),
    embed_button_text: normalizeHex($("#buttonTextHex").value, "#FFFFFF"),
  };
}

function applySettingsToForm(c) {
  if (!c) return;
  $("#websiteUrl").value = c.website_url ?? "";
  $("#bookingUrl").value = c.booking_url ?? "";
  $("#notifyLeadEmail").checked = c.notify_lead_email !== false;
  $("#embedAutoPrompt").checked = c.embed_auto_prompt === true;
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

function embedLandingUrl(slug) {
  return `${siteOrigin}/c/${encodeURIComponent(slug)}/`;
}

/** Popup / atelier tool (welcome + example slider). */
function embedToolUrl(slug) {
  return `${siteOrigin}/embed.html?clinic=${encodeURIComponent(slug)}`;
}

function buildSnippet(c, settings) {
  const slug = c?.slug;
  if (!slug) return "";
  const url = embedToolUrl(slug);
  const label = escapeHtml(settings.embed_button_label);
  const bg = settings.embed_button_bg;
  const fg = settings.embed_button_text;
  return `<button type="button"
  onclick="window.open('${url}','hebelie','width=440,height=920,noopener,noreferrer')"
  style="background:${bg};color:${fg};border:0;padding:14px 28px;font-family:system-ui,sans-serif;font-size:15px;cursor:pointer;letter-spacing:0.02em;">
  ${label}
</button>`;
}

function buildLoaderSnippet(c) {
  const slug = c?.slug;
  if (!slug) return "";
  const origin = siteOrigin.replace(/\/$/, "");
  return `<script type="module" src="${origin}/embed-loader.js" data-clinic="${escapeHtml(slug)}"><\/script>`;
}

function shareCaption(c, landingUrl) {
  const name = c?.name || "Our clinic";
  return `See how treatments could look on you — ${name}. Try a private preview on your own photo: ${landingUrl}`;
}

const HEBELIE_EMBED_SUPPORT = "onboarding@hebelie.com";

function buildAgencyWorkOrder(c, settings) {
  if (!c?.slug) return "";
  const name = c.name || "Clinic";
  const tool = embedToolUrl(c.slug);
  const buttonCode = buildSnippet(c, settings);
  const loaderCode = buildLoaderSnippet(c);
  const promptOn = settings.embed_auto_prompt;
  const rule = "—".repeat(56);

  const lines = [
    "WORK ORDER: Hebelie treatment preview (website embed)",
    "═".repeat(56),
    "",
    `Clinic: ${name}`,
    "",
    `Hebelie technical support (embed issues only): ${HEBELIE_EMBED_SUPPORT}`,
    "",
    "GOAL",
    "Add Hebelie so visitors can preview aesthetic treatments on their own photo.",
    "Completed previews send leads to the clinic Hebelie dashboard.",
    "",
    rule,
    "1) PREVIEW BUTTON",
    rule,
    "Placement: Homepage / main landing — visible above the fold or with primary CTAs.",
    "Paste before </body> on the homepage (and key landing pages if agreed):",
    "",
    buttonCode,
    "",
    "Opens a popup (~440×920) to: " + tool,
    "",
  ];

  let step = 2;
  if (promptOn) {
    lines.push(
      rule,
      `${step}) TIMED WELCOME PROMPT`,
      rule,
      "Paste once before </body> (site-wide or homepage):",
      "",
      loaderCode,
      "",
      "The prompt appears about 3 seconds after arrival; the preview opens when the visitor taps the CTA.",
      "",
    );
    step += 1;
  }

  lines.push(
    rule,
    `${step}) QA CHECKLIST`,
    rule,
    "[ ] Button visible on desktop and mobile",
    "[ ] Popup opens and preview flow completes",
    "[ ] Clinic confirms a test lead in the Hebelie dashboard",
    "",
    "Thank you,",
    name,
  );
  return lines.join("\n");
}

function renderSettingsSummary(settings) {
  const el = $("#settingsSummary");
  if (!el) return;
  const popup = settings.embed_auto_prompt
    ? "Welcome popup on (3 seconds after arrival)"
    : "Welcome popup off";
  const emails = settings.notify_lead_email ? "Preview emails on" : "Preview emails off";
  el.innerHTML = [
    `<strong>Button:</strong> ${escapeHtml(settings.embed_button_label)}`,
    `<strong>Colors:</strong> ${escapeHtml(settings.embed_button_bg)} / ${escapeHtml(settings.embed_button_text)}`,
    `<strong>${escapeHtml(popup)}</strong> · ${escapeHtml(emails)}`,
  ].join(" · ");
}

function hideInstallPaths() {
  $("#pathDiy").hidden = true;
  $("#pathAgency").hidden = true;
}

function showEmbedStep(step) {
  const s1 = step === 1;
  $("#embedStep1").hidden = !s1;
  $("#embedStep2").hidden = s1;
  $("#embedStepLabel1").classList.toggle("on", s1);
  $("#embedStepLabel2").classList.toggle("on", !s1);
  if (!s1) {
    hideInstallPaths();
    const settings = readFormSettings();
    renderSettingsSummary(settings);
    updateSnippet();
  }
}

function showInstallPath(which) {
  $("#pathDiy").hidden = which !== "diy";
  $("#pathAgency").hidden = which !== "agency";
  if (which === "agency") updateDistribution();
}

function updateDistribution() {
  const c = activeClinic();
  const settings = readFormSettings();
  if (!c?.slug) return;

  const landing = embedLandingUrl(c.slug);

  $("#sharePublicUrl").value = landing;
  $("#shareCaptionHint").textContent =
    "Instagram & Snapchat: use Copy link, then paste in bio or link sticker. Suggested caption copied with the link.";

  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(landing)}`;
  const tw = `https://twitter.com/intent/tweet?url=${encodeURIComponent(landing)}&text=${encodeURIComponent(
    `See how treatments could look on you — ${c.name || "our clinic"}`,
  )}`;
  $("#shareFacebook").href = fb;
  $("#shareTwitter").href = tw;

  $("#agencyWorkOrder").value = buildAgencyWorkOrder(c, settings);
}

function updateSnippet() {
  const c = activeClinic();
  const settings = readFormSettings();
  $("#snippetCode").value = buildSnippet(c, settings);
  $("#loaderSnippetCode").value = buildLoaderSnippet(c);
  const loaderBlock = $("#loaderSnippetBlock");
  if (loaderBlock) loaderBlock.hidden = !settings.embed_auto_prompt;
  if (c?.slug) {
    $("#testEmbed").href = embedToolUrl(c.slug);
    $("#iframeUrl").textContent = embedLandingUrl(c.slug);
  }
  updateDistribution();
}

const PREVIEW_BUCKET = "clinic-leads";

async function signedPreviewUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const { data, error } = await supabase.storage
    .from(PREVIEW_BUCKET)
    .createSignedUrl(pathOrUrl, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function loadLeads(clinicIds) {
  if (!clinicIds.length) return [];
  const { data, error } = await supabase
    .from("atelier_leads")
    .select("created_at, name, email, phone, treatments, before_url, after_url")
    .in("clinic_id", clinicIds)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = data ?? [];
  await Promise.all(
    rows.map(async (r) => {
      r.beforeSigned = await signedPreviewUrl(r.before_url);
      r.afterSigned = await signedPreviewUrl(r.after_url);
    }),
  );
  return rows;
}

function renderPreviewCell(r) {
  if (!r.beforeSigned && !r.afterSigned) return "—";
  const parts = [];
  if (r.beforeSigned) {
    parts.push(
      `<a href="${escapeHtml(r.beforeSigned)}" target="_blank" rel="noopener" title="Before"><img src="${escapeHtml(r.beforeSigned)}" alt="Before" width="56" height="56"></a>`,
    );
  }
  if (r.afterSigned) {
    parts.push(
      `<a href="${escapeHtml(r.afterSigned)}" target="_blank" rel="noopener" title="After preview"><img src="${escapeHtml(r.afterSigned)}" alt="After preview" width="56" height="56"></a>`,
    );
  }
  return `<div class="lead-thumbs">${parts.join("")}</div>`;
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
<td>${renderPreviewCell(r)}</td>
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
$("#tabEmbed").onclick = () => {
  selectTab(false);
  showEmbedStep(1);
};

$("#embedBackToStep1").onclick = () => showEmbedStep(1);
$("#chooseDiy").onclick = () => showInstallPath("diy");
$("#chooseAgency").onclick = () => showInstallPath("agency");

$("#clinicSelect").onchange = async () => {
  activeClinicId = $("#clinicSelect").value;
  applySettingsToForm(activeClinic());
  showEmbedStep(1);
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

$("#embedAutoPrompt")?.addEventListener("change", () => updateSnippet());

$("#buttonBg").oninput = () => syncColorPickers("bg");
$("#buttonBgHex").oninput = () => syncColorPickers("bgHex");
$("#buttonText").oninput = () => syncColorPickers("text");
$("#buttonTextHex").oninput = () => syncColorPickers("textHex");

$("#buttonPreview").onclick = () => {
  const c = activeClinic();
  if (c?.slug) window.open(embedToolUrl(c.slug), "hebelie", "width=440,height=920,noopener,noreferrer");
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
    p_notify_lead_email: s.notify_lead_email,
    p_embed_auto_prompt: s.embed_auto_prompt,
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

  msg.textContent = "Saved.";
  msg.classList.add("ok");
  updateSnippet();
  showEmbedStep(2);
};

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    $("#settingsMsg").textContent = okMsg;
    $("#settingsMsg").classList.add("ok");
  } catch {
    $("#settingsMsg").textContent = "Could not copy—select and copy manually.";
  }
}

async function copyTextarea(el, okMsg) {
  await copyText(el.value, okMsg);
  try {
    el.select();
  } catch {
    /* ignore */
  }
}

$("#copySnippet").onclick = () => copyTextarea($("#snippetCode"), "Embed code copied.");
$("#copyLoaderSnippet").onclick = () => copyTextarea($("#loaderSnippetCode"), "Prompt script copied.");

$("#copyShareUrl").onclick = async () => {
  const c = activeClinic();
  const landing = c?.slug ? embedLandingUrl(c.slug) : $("#sharePublicUrl").value;
  await copyText(landing, "Preview link copied.");
};

async function copySocialPack() {
  const c = activeClinic();
  if (!c?.slug) return;
  const landing = embedLandingUrl(c.slug);
  const text = `${shareCaption(c, landing)}`;
  await copyText(text, "Link and caption copied.");
}

$("#shareInstagram").onclick = () => void copySocialPack();
$("#shareSnapchat").onclick = () => void copySocialPack();

$("#copyWorkOrder").onclick = () => copyTextarea($("#agencyWorkOrder"), "Work order copied.");

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
  showEmbedStep(1);
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
