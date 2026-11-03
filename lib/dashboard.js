import { CONFIG } from "../config.js";
import {
  BILLING_PLANS,
  FREE_TRIAL_PLAN_ID,
  FREE_TRIAL_PREVIEWS,
  isPaidPlanId,
  PUBLIC_BILLING_PLANS,
} from "./billing-plans.js";
import {
  billingCurrencyForCountry,
  formatPlanPriceAmount,
  shortPriceSuffix,
} from "./billing-locale.js";
import { clearAuthIntent, peekAuthIntent } from "./auth-intent.js";
import {
  defaultEmbedButtonLabel,
  inferEmbedLocaleFromWebsite,
  isDefaultEmbedButtonLabel,
  normalizeEmbedLocale,
  withEmbedLang,
} from "./embed-locale.js";
import { ensureClinicForSession, resolveLoginContext } from "./clinic-provision.js";
import { getSession, onAuth, supabase, waitForSession } from "./supabase.js?v=19";

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

const DASH_TAB_KEY = "hebelie-dashboard-tab";
const DASH_EMBED_STEP_KEY = "hebelie-dashboard-embed-step";

/** @type {"leads"|"embed"|"billing"|"usage"} */
let activeTab = "leads";
let uiBootstrapped = false;
let lastSessionUserId = null;

const DASH_TABS = ["leads", "embed", "billing", "usage"];

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
    q.has("resume") ||
    q.has("code") ||
    q.has("token_hash") ||
    q.get("type") === "signup" ||
    q.get("type") === "magiclink" ||
    /access_token|refresh_token/.test(location.hash)
  );
}

async function absorbEmailLinkTokens() {
  if (!supabase) return;
  const q = new URLSearchParams(location.search);
  const tokenHash = q.get("token_hash");
  const type = q.get("type");
  if (!tokenHash || !type) return;
  const allowed = new Set(["signup", "email", "magiclink", "invite", "recovery"]);
  if (!allowed.has(type)) return;
  await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: /** @type {import("@supabase/supabase-js").EmailOtpType} */ (type),
  });
}

function stripDashboardAuthParams() {
  const u = new URL(location.href);
  u.searchParams.delete("from_auth");
  u.searchParams.delete("resume");
  u.searchParams.delete("code");
  u.searchParams.delete("token_hash");
  u.searchParams.delete("type");
  u.hash = "";
  history.replaceState(null, "", u.pathname + u.search);
}

async function resolveSession() {
  if (authPendingInUrl()) {
    await absorbEmailLinkTokens();
  }
  let session = await getSession();
  if (session) return session;
  const waitMs = authPendingInUrl() ? 25000 : 2500;
  return waitForSession(waitMs);
}

async function maybeProvisionAfterEmailConfirm(session) {
  if (!session || !authPendingInUrl()) return;
  const ctx = resolveLoginContext(session, {});
  if (ctx.role !== "pro") return;
  if (!ctx.clinicName && !peekAuthIntent()?.clinicName) return;
  const result = await ensureClinicForSession(session, ctx);
  if (result.ok) clearAuthIntent();
}

function activeClinic() {
  return clinics.find((c) => c.id === activeClinicId) ?? clinics[0] ?? null;
}

function normalizeHex(v, fallback) {
  const s = String(v || "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s;
  return fallback;
}

function readVisitorDailyCap() {
  if ($("#visitorDailyUnlimited")?.checked) return { cap: null, unlimited: true };
  let n = parseInt($("#visitorDailyCap")?.value ?? "5", 10);
  if (!Number.isFinite(n)) n = 5;
  return { cap: Math.min(100, Math.max(2, n)), unlimited: false };
}

function readFormSettings() {
  const visitor = readVisitorDailyCap();
  return {
    website_url: $("#websiteUrl").value.trim(),
    booking_url: $("#bookingUrl").value.trim(),
    notify_lead_email: $("#notifyLeadEmail").checked,
    embed_auto_prompt: $("#embedAutoPrompt").checked,
    embed_button_label:
      $("#buttonLabel").value.trim() ||
      defaultEmbedButtonLabel(normalizeEmbedLocale($("#embedLocale")?.value)),
    embed_button_bg: normalizeHex($("#buttonBgHex").value, "#9A8565"),
    embed_button_text: normalizeHex($("#buttonTextHex").value, "#FFFFFF"),
    embed_locale: normalizeEmbedLocale($("#embedLocale")?.value),
    visitor_daily_unlimited: visitor.unlimited,
    max_previews_per_visitor_per_day: visitor.cap,
  };
}

function applySettingsToForm(c) {
  if (!c) return;
  $("#websiteUrl").value = c.website_url ?? "";
  $("#bookingUrl").value = c.booking_url ?? "";
  $("#notifyLeadEmail").checked = c.notify_lead_email !== false;
  $("#embedAutoPrompt").checked = c.embed_auto_prompt === true;
  const visitorCap = c.max_previews_per_visitor_per_day;
  const unlimited = visitorCap == null;
  if ($("#visitorDailyUnlimited")) $("#visitorDailyUnlimited").checked = unlimited;
  if ($("#visitorDailyCap")) {
    $("#visitorDailyCap").value = unlimited ? "5" : String(Math.max(2, visitorCap));
    $("#visitorDailyCap").disabled = unlimited;
  }
  const locale = normalizeEmbedLocale(c.embed_locale);
  if ($("#embedLocale")) {
    $("#embedLocale").value = locale;
    if (c.embed_locale === "en" || c.embed_locale === "fr") {
      $("#embedLocale").dataset.userSet = "1";
    } else {
      delete $("#embedLocale").dataset.userSet;
    }
  }
  $("#buttonLabel").value = c.embed_button_label ?? defaultEmbedButtonLabel(locale);
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
function embedToolUrl(slug, locale = "en") {
  const base = `${siteOrigin}/embed.html?clinic=${encodeURIComponent(slug)}`;
  return withEmbedLang(base, normalizeEmbedLocale(locale));
}

function buildSnippet(c, settings) {
  const slug = c?.slug;
  if (!slug) return "";
  const url = embedToolUrl(slug, settings.embed_locale);
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

const HEBELIE_EMBED_SUPPORT = "contact@hebelie.com";

function buildAgencyWorkOrder(c, settings) {
  if (!c?.slug) return "";
  const name = c.name || "Clinic";
  const tool = embedToolUrl(c.slug, settings.embed_locale);
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
    `For embed technical issues, you can contact ${HEBELIE_EMBED_SUPPORT}.`,
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
  const visitor =
    settings.visitor_daily_unlimited
      ? "No daily limit per visitor"
      : `${settings.max_previews_per_visitor_per_day} previews / visitor / day`;
  const lang =
    settings.embed_locale === "fr" ? "Patient language: Français" : "Patient language: English";
  el.innerHTML = [
    `<strong>Button:</strong> ${escapeHtml(settings.embed_button_label)}`,
    `<strong>Colors:</strong> ${escapeHtml(settings.embed_button_bg)} / ${escapeHtml(settings.embed_button_text)}`,
    `<strong>${escapeHtml(lang)}</strong>`,
    `<strong>${escapeHtml(popup)}</strong> · ${escapeHtml(emails)}`,
    `<strong>${escapeHtml(visitor)}</strong>`,
  ].join(" · ");
}

function hideInstallPaths() {
  $("#pathDiy").hidden = true;
  $("#pathAgency").hidden = true;
}

function storedEmbedStep() {
  try {
    const n = parseInt(sessionStorage.getItem(DASH_EMBED_STEP_KEY) ?? "1", 10);
    return n === 2 ? 2 : 1;
  } catch {
    return 1;
  }
}

function showEmbedStep(step) {
  const s = step === 2 ? 2 : 1;
  try {
    sessionStorage.setItem(DASH_EMBED_STEP_KEY, String(s));
  } catch {
    /* ignore */
  }
  const s1 = s === 1;
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
    $("#testEmbed").href = embedToolUrl(c.slug, settings.embed_locale);
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

function normalizeDashboardTab(tab) {
  if (tab === "customize") return "embed";
  return DASH_TABS.includes(tab) ? tab : null;
}

function persistDashboardTab(w) {
  try {
    sessionStorage.setItem(DASH_TAB_KEY, w);
  } catch {
    /* ignore */
  }
  const u = new URL(location.href);
  if (w === "leads") u.searchParams.delete("tab");
  else u.searchParams.set("tab", w);
  history.replaceState(null, "", u.pathname + u.search);
}

function getPersistedDashboardTab() {
  const fromUrl = normalizeDashboardTab(new URLSearchParams(location.search).get("tab"));
  if (fromUrl) return fromUrl;
  try {
    const stored = normalizeDashboardTab(sessionStorage.getItem(DASH_TAB_KEY));
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  return "leads";
}

/** @param {{ resetEmbedStep?: boolean }} [opts] */
function selectTab(which, opts = {}) {
  const w = normalizeDashboardTab(which) ?? "leads";
  activeTab = w;
  persistDashboardTab(w);
  $("#tabLeads").setAttribute("aria-selected", w === "leads" ? "true" : "false");
  $("#tabUsage").setAttribute("aria-selected", w === "usage" ? "true" : "false");
  $("#tabEmbed").setAttribute("aria-selected", w === "embed" ? "true" : "false");
  $("#tabBilling").setAttribute("aria-selected", w === "billing" ? "true" : "false");
  $("#panelLeads").hidden = w !== "leads";
  $("#panelUsage").hidden = w !== "usage";
  $("#panelEmbed").hidden = w !== "embed";
  $("#panelBilling").hidden = w !== "billing";
  if (w === "embed") {
    const step = opts.resetEmbedStep ? 1 : storedEmbedStep();
    showEmbedStep(step);
  }
  if (w === "usage") renderUsage();
  if (w === "billing") renderBilling();
}

$("#tabLeads").onclick = () => selectTab("leads", { resetEmbedStep: true });
$("#tabUsage").onclick = () => selectTab("usage", { resetEmbedStep: true });
$("#tabEmbed").onclick = () => selectTab("embed", { resetEmbedStep: activeTab !== "embed" });
$("#tabBilling").onclick = () => selectTab("billing", { resetEmbedStep: true });
$("#usageGoBilling").onclick = () => selectTab("billing", { resetEmbedStep: true });

$("#embedBackToStep1").onclick = () => showEmbedStep(1);
$("#chooseDiy").onclick = () => showInstallPath("diy");
$("#chooseAgency").onclick = () => showInstallPath("agency");

$("#clinicSelect").onchange = async () => {
  activeClinicId = $("#clinicSelect").value;
  applySettingsToForm(activeClinic());
  if (activeTab === "embed") showEmbedStep(1);
  updateSnippet();
  const rows = await loadLeads([activeClinicId]);
  renderLeads(rows);
  renderUsage();
  renderBilling();
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

function suggestEmbedLocaleFromWebsite() {
  const url = $("#websiteUrl")?.value?.trim();
  if (!url) return;
  const inferred = inferEmbedLocaleFromWebsite(url);
  if (!inferred) return;
  const sel = $("#embedLocale");
  if (!sel || sel.dataset.userSet === "1") return;
  sel.value = inferred;
  const label = $("#buttonLabel");
  if (
    label &&
    (isDefaultEmbedButtonLabel(label.value, "en") || isDefaultEmbedButtonLabel(label.value, "fr"))
  ) {
    label.value = defaultEmbedButtonLabel(inferred);
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

$("#websiteUrl")?.addEventListener("blur", suggestEmbedLocaleFromWebsite);

$("#embedLocale")?.addEventListener("change", () => {
  const sel = $("#embedLocale");
  if (sel) sel.dataset.userSet = "1";
  const loc = normalizeEmbedLocale(sel?.value);
  const label = $("#buttonLabel");
  if (
    label &&
    (isDefaultEmbedButtonLabel(label.value, "en") || isDefaultEmbedButtonLabel(label.value, "fr"))
  ) {
    label.value = defaultEmbedButtonLabel(loc);
  }
  updatePreview();
  updateSnippet();
});

$("#embedAutoPrompt")?.addEventListener("change", () => updateSnippet());

function syncVisitorDailyCapUi() {
  const unlimited = $("#visitorDailyUnlimited")?.checked;
  const input = $("#visitorDailyCap");
  if (!input) return;
  input.disabled = unlimited;
  if (!unlimited) {
    let n = parseInt(input.value, 10);
    if (!Number.isFinite(n) || n < 2) input.value = "2";
    if (n > 100) input.value = "100";
  }
}

$("#visitorDailyUnlimited")?.addEventListener("change", syncVisitorDailyCapUi);
$("#visitorDailyCap")?.addEventListener("change", syncVisitorDailyCapUi);
$("#visitorDailyCap")?.addEventListener("input", syncVisitorDailyCapUi);

$("#buttonBg").oninput = () => syncColorPickers("bg");
$("#buttonBgHex").oninput = () => syncColorPickers("bgHex");
$("#buttonText").oninput = () => syncColorPickers("text");
$("#buttonTextHex").oninput = () => syncColorPickers("textHex");

$("#buttonPreview").onclick = () => {
  const c = activeClinic();
  if (c?.slug) {
    const s = readFormSettings();
    window.open(embedToolUrl(c.slug, s.embed_locale), "hebelie", "width=440,height=920,noopener,noreferrer");
  }
};

$("#settingsForm").onsubmit = async (e) => {
  e.preventDefault();
  const c = activeClinic();
  const msg = $("#settingsMsg");
  msg.textContent = "";
  msg.classList.remove("ok");
  if (!c?.id) return;

  const s = readFormSettings();
  if (s.booking_url && /dashboard\.html/i.test(s.booking_url)) {
    msg.textContent =
      "Booking URL should point to your clinic scheduler (Calendly, Jane, etc.), not the Hebelie dashboard.";
    return;
  }
  const { data, error } = await supabase.rpc("update_my_clinic", {
    p_clinic_id: c.id,
    p_website_url: s.website_url || null,
    p_booking_url: s.booking_url || null,
    p_embed_button_label: s.embed_button_label,
    p_embed_button_bg: s.embed_button_bg,
    p_embed_button_text: s.embed_button_text,
    p_notify_lead_email: s.notify_lead_email,
    p_embed_auto_prompt: s.embed_auto_prompt,
    p_max_previews_per_visitor_per_day: s.visitor_daily_unlimited ? null : s.max_previews_per_visitor_per_day,
    p_clear_visitor_daily_cap: s.visitor_daily_unlimited,
    p_embed_locale: s.embed_locale,
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

function onHebelieFreeTrial(c) {
  if (!c || c.billing_exempt) return false;
  return c.billing_plan === "free_trial" && c.subscription_status === "trial";
}

function billingActive(c) {
  if (!c) return false;
  if (c.billing_exempt) return true;
  if (onHebelieFreeTrial(c)) return true;
  return c.subscription_status === "active" || c.subscription_status === "trialing";
}

function hasPaidSubscription(c) {
  if (!c || c.billing_exempt || onHebelieFreeTrial(c)) return false;
  return c.subscription_status === "active" || c.subscription_status === "trialing";
}

function planDisplayName(c) {
  if (onHebelieFreeTrial(c)) return "Free trial";
  return BILLING_PLANS.find((p) => p.id === c?.billing_plan)?.name ?? c?.billing_plan ?? "—";
}

function visitorCapLabel(c) {
  const cap = c?.max_previews_per_visitor_per_day;
  if (cap == null) return "No daily limit per visitor";
  return `${cap} per visitor per day (UTC)`;
}

function renderUsage() {
  const c = activeClinic();
  const remainingEl = $("#usageRemaining");
  const headlineEl = $("#usageHeadline");
  const bar = $("#usageTabBar");
  const fill = $("#usageTabFill");
  const details = $("#usageDetails");
  const footnote = $("#usageFootnote");
  const goBilling = $("#usageGoBilling");

  if (!c || !remainingEl) return;

  if (c.billing_exempt) {
    remainingEl.textContent = "Unlimited";
    headlineEl.textContent = "Demo / exempt account — previews are not metered.";
    bar.hidden = true;
    details.innerHTML = "";
    footnote.textContent = "";
    goBilling.hidden = true;
    return;
  }

  const used = c.previews_used_period ?? 0;
  const quota = c.preview_quota_monthly ?? 0;
  const active = billingActive(c);
  const freeTrial = onHebelieFreeTrial(c);
  const remaining = quota > 0 ? Math.max(0, quota - used) : 0;

  if (active && quota > 0) {
    remainingEl.textContent = String(remaining);
    headlineEl.textContent = freeTrial
      ? remaining === 1
        ? "free trial preview left"
        : "free trial previews left"
      : remaining === 1
        ? "preview left this billing period"
        : "previews left this billing period";
    const pct = Math.min(100, Math.round((used / quota) * 100));
    bar.hidden = false;
    fill.style.width = `${pct}%`;
    if (freeTrial) {
      details.innerHTML = [
        row("Plan", planDisplayName(c)),
        row("Used", String(used)),
        row("Trial included", String(quota)),
        row("Per visitor (daily)", visitorCapLabel(c)),
      ].join("");
      footnote.textContent = `Your clinic gets ${FREE_TRIAL_PREVIEWS} completed embed previews to try Hebelie—no card required. Subscribe before you run out to keep generating previews.`;
      goBilling.hidden = false;
      goBilling.textContent = "Choose a plan";
    } else {
      details.innerHTML = [
        row("Plan", planDisplayName(c)),
        row("Used this period", String(used)),
        row("Included in plan", String(quota)),
        row("Period ends", c.billing_period_end ? fmtDate(c.billing_period_end) : "—"),
        row("Per visitor (daily)", visitorCapLabel(c)),
      ].join("");
      footnote.textContent =
        "When the period renews, your included previews reset. Each completed embed preview uses one credit.";
      goBilling.hidden = false;
      goBilling.textContent = "Manage subscription";
    }
  } else {
    remainingEl.textContent = "—";
    headlineEl.textContent = active
      ? "No preview quota on your plan yet."
      : "Subscribe to get monthly previews on your embed.";
    bar.hidden = true;
    details.innerHTML = [
      row("Subscription", c.subscription_status ?? "Not active"),
      row("Per visitor (daily)", visitorCapLabel(c)),
    ].join("");
    footnote.textContent = "Choose a plan under Billing to enable website previews.";
    goBilling.hidden = false;
    goBilling.textContent = "View plans & billing";
  }

  function row(label, value) {
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  }
}

function renderBillingPlanGrid(c) {
  const grid = $("#billingPlanGrid");
  if (!grid) return;
  const billCur = billingCurrencyForCountry(c?.billing_country);
  const curSuffix = shortPriceSuffix(billCur);
  const onFree = onHebelieFreeTrial(c);
  const paid = hasPaidSubscription(c);

  grid.innerHTML = PUBLIC_BILLING_PLANS.map((p) => {
    const rec = p.recommended ? " plan-card rec" : " plan-card";
    const isFreePlan = p.id === FREE_TRIAL_PLAN_ID;
    const currentPaid = !isFreePlan && c?.billing_plan === p.id && paid;
    const currentFree = isFreePlan && onFree;

    let priceLine;
    let quotaLine;
    let btnLabel;
    let btnDisabled = false;
    let dataPlan = "";

    if (isFreePlan) {
      priceLine = "Free";
      quotaLine = `${p.previews} previews to start (one-time)`;
      if (currentFree) {
        btnLabel = "Current plan";
        btnDisabled = true;
      } else if (paid) {
        btnLabel = "Included at signup";
        btnDisabled = true;
      } else {
        btnLabel = "Trial used — pick a paid plan";
        btnDisabled = true;
      }
    } else {
      priceLine = `${formatPlanPriceAmount(p.monthlyAmount, billCur)} ${curSuffix}`;
      quotaLine = `${p.previews} previews / month`;
      dataPlan = p.id;
      if (currentPaid) {
        btnLabel = "Current plan";
        btnDisabled = true;
      } else {
        btnLabel = "Subscribe";
      }
    }

    const currentTag = currentFree || currentPaid ? " · current" : "";
    return `<div class="${rec.trim()}">
<h4>${escapeHtml(isFreePlan ? "Free" : p.name)}${currentTag}</h4>
<p class="price">${escapeHtml(priceLine)}</p>
<p class="meta">${escapeHtml(quotaLine)}</p>
<button class="btn ghost" type="button" ${dataPlan ? `data-plan="${dataPlan}"` : ""} ${btnDisabled ? "disabled" : ""}>
${escapeHtml(btnLabel)}
</button>
</div>`;
  }).join("");
  grid.querySelectorAll("[data-plan]").forEach((btn) => {
    btn.onclick = () => void startCheckout(btn.getAttribute("data-plan"));
  });
}

function renderBilling() {
  const c = activeClinic();
  const statusEl = $("#billingStatus");
  const manageBtn = $("#manageBilling");
  const picker = $("#planPicker");
  const msg = $("#billingMsg");

  if (!c) {
    statusEl.textContent = "No clinic selected.";
    return;
  }

  const currencyNote = $("#billingCurrencyNote");
  if (currencyNote) {
    const cc = c.billing_country ?? "CA";
    const cur = billingCurrencyForCountry(cc);
    if (cc === "CA") {
      currencyNote.textContent =
        "Billing in CAD (Canada). Europe: EUR; other countries: USD — same plan amounts.";
    } else if (cur === "eur") {
      currencyNote.textContent = `Billing in EUR (${cc}${c.billing_region ? ` · ${c.billing_region}` : ""}).`;
    } else {
      currencyNote.textContent = `Billing in USD (${cc}${c.billing_region ? ` · ${c.billing_region}` : ""}).`;
    }
  }

  if (c.billing_exempt) {
    statusEl.textContent = "This clinic is on a demo / exempt account. Previews are not metered.";
    manageBtn.hidden = true;
    picker.hidden = true;
    return;
  }

  const quota = c.preview_quota_monthly ?? 0;
  const active = billingActive(c);
  const freeTrial = onHebelieFreeTrial(c);
  const planName = planDisplayName(c);

  if (freeTrial && quota > 0) {
    const left = Math.max(0, quota - (c.previews_used_period ?? 0));
    statusEl.textContent = `Free trial: ${left} of ${quota} previews remaining. Subscribe for monthly previews on your embed.`;
    manageBtn.hidden = true;
    picker.hidden = false;
    renderBillingPlanGrid(c);
  } else if (active && quota > 0 && hasPaidSubscription(c)) {
    statusEl.textContent = `Plan: ${planName}. Status: ${c.subscription_status}. See the Usage tab for previews remaining.`;
    manageBtn.hidden = !c.stripe_customer_id;
    picker.hidden = true;
  } else {
    statusEl.textContent =
      c.subscription_status === "past_due"
        ? "Your subscription payment is past due. Update your payment method to restore previews."
        : "Subscribe to enable previews on your website embed.";
    manageBtn.hidden = !c.stripe_customer_id;
    picker.hidden = false;
    renderBillingPlanGrid(c);
  }

  if (msg && new URLSearchParams(location.search).get("checkout") === "success") {
    if (billingActive(c) && (c.preview_quota_monthly ?? 0) > 0) {
      msg.textContent = "Subscription active. See the Usage tab for your preview allowance.";
      msg.classList.add("ok");
    } else {
      msg.textContent =
        "Payment received. If usage is not updated yet, wait a minute and refresh—or check Stripe webhooks in Supabase function logs.";
      msg.classList.add("ok");
    }
  }
}

async function startCheckout(planId) {
  const c = activeClinic();
  const msg = $("#billingMsg");
  if (!c?.id || !planId) return;
  if (!isPaidPlanId(planId) || planId === FREE_TRIAL_PLAN_ID) {
    msg.textContent = "The free tier is applied when you create your clinic—choose a paid plan to subscribe.";
    return;
  }
  msg.textContent = "Opening secure checkout…";
  msg.classList.remove("ok");
  const { data, error } = await supabase.functions.invoke("billing-checkout", {
    body: { clinic_id: c.id, plan: planId },
  });
  if (error || data?.error) {
    const code = data?.error;
    const messages = {
      price_not_configured: "Billing is not configured yet. Contact contact@hebelie.com.",
      price_mode_mismatch:
        "Stripe test/live mismatch on prices. Check Supabase STRIPE_PRICE_* secrets match your STRIPE_SECRET_KEY mode.",
      unauthorized: "Please sign in again, then retry checkout.",
      forbidden: "You cannot subscribe for this clinic.",
      stripe_failed: "Stripe rejected checkout. Try again or contact contact@hebelie.com.",
    };
    msg.textContent = messages[code] ?? "Could not start checkout. Try again.";
    selectTab("billing");
    return;
  }
  if (data?.url) location.href = data.url;
}

async function openBillingPortal() {
  const c = activeClinic();
  const msg = $("#billingMsg");
  if (!c?.id) return;
  msg.textContent = "Opening billing portal…";
  const { data, error } = await supabase.functions.invoke("billing-portal", {
    body: { clinic_id: c.id },
  });
  if (error || data?.error) {
    msg.textContent = "Could not open billing portal.";
    return;
  }
  if (data?.url) location.href = data.url;
}

$("#manageBilling").onclick = () => void openBillingPortal();

function initialDashboardTab() {
  return getPersistedDashboardTab();
}

function cleanDashboardQueryParams() {
  const u = new URL(location.href);
  let changed = false;
  for (const key of ["checkout", "tab", "plan", "from_auth"]) {
    if (u.searchParams.has(key)) {
      u.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) history.replaceState(null, "", u.pathname + u.search);
}

function showLeadsCheckoutNotice() {
  const el = $("#leadsCheckoutMsg");
  if (!el) return;
  const c = activeClinic();
  if (billingActive(c) && (c.preview_quota_monthly ?? 0) > 0) {
    el.textContent =
      "Subscription active. See the Usage tab for previews remaining this billing period.";
  } else {
    el.textContent =
      "Payment received. If usage is not updated yet, wait a minute and refresh—or open Billing for plan details.";
  }
  el.hidden = false;
}

function pendingCheckoutPlan() {
  return new URLSearchParams(location.search).get("plan");
}

async function softRefreshUI(session) {
  if (!session) return;

  const { data, error } = await supabase.rpc("get_my_clinics");
  if (error) return;
  clinics = data ?? [];
  if (!clinics.length) return;

  if (!activeClinicId || !clinics.some((c) => c.id === activeClinicId)) {
    activeClinicId = clinics[0].id;
  }

  $("#clinicLabel").textContent = clinics.map((c) => c.name).join(" · ");
  renderClinicSelect();

  const filterIds =
    clinics.length > 1 && activeClinicId ? [activeClinicId] : clinics.map((c) => c.id);
  const rows = await loadLeads(filterIds);
  renderLeads(rows);
  renderUsage();
  if (activeTab === "billing") renderBilling();
}

/** @param {import("@supabase/supabase-js").Session} session @param {{ full?: boolean }} [opts] */
async function refreshUI(session, opts = {}) {
  const full = opts.full !== false;
  if (!session) {
    location.href = "./auth.html?as=professional&mode=signin";
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

  const clinicChanged =
    activeClinicId && !clinics.some((c) => c.id === activeClinicId);
  if (!activeClinicId || clinicChanged) {
    activeClinicId = clinics[0].id;
  }

  $("#clinicLabel").textContent = clinics.map((c) => c.name).join(" · ");
  renderClinicSelect();

  const onEmbedTab = activeTab === "embed" || getPersistedDashboardTab() === "embed";
  const skipFormReset = uiBootstrapped && onEmbedTab && !clinicChanged && !full;
  if (!skipFormReset) {
    applySettingsToForm(activeClinic());
    updateSnippet();
  }

  const filterIds =
    clinics.length > 1 && activeClinicId ? [activeClinicId] : clinics.map((c) => c.id);
  const rows = await loadLeads(filterIds);
  renderLeads(rows);
  renderUsage();

  const checkoutSuccess = new URLSearchParams(location.search).get("checkout") === "success";
  const tab = checkoutSuccess ? "leads" : initialDashboardTab();
  selectTab(tab, { resetEmbedStep: checkoutSuccess || tab !== "embed" });
  if (checkoutSuccess) {
    await reloadClinicsFromServer();
    selectTab("leads", { resetEmbedStep: true });
    showLeadsCheckoutNotice();
    cleanDashboardQueryParams();
  }
  const plan = pendingCheckoutPlan();
  if (plan && isPaidPlanId(plan) && !billingActive(activeClinic())) {
    await startCheckout(plan);
  }

  uiBootstrapped = true;
  lastSessionUserId = session.user.id;
}

async function reloadClinicsFromServer() {
  const { data, error } = await supabase.rpc("get_my_clinics");
  if (error || !data?.length) return;
  clinics = data;
  if (!activeClinicId || !clinics.some((c) => c.id === activeClinicId)) {
    activeClinicId = clinics[0].id;
  }
  applySettingsToForm(activeClinic());
  renderUsage();
  renderBilling();
}

$("#signOut").onclick = async () => {
  await supabase.auth.signOut();
  location.href = "./auth.html?as=professional&mode=signin";
};

onAuth((session) => {
  if (!session) return;
  const uid = session.user.id;
  if (uiBootstrapped && uid === lastSessionUserId) {
    void softRefreshUI(session);
    return;
  }
  void refreshUI(session, { full: true });
});

async function boot() {
  activeTab = getPersistedDashboardTab();
  const pendingAuth = authPendingInUrl();
  const session = await resolveSession();
  if (!session) {
    if (pendingAuth) {
      location.href = "./auth.html?as=professional&mode=signup&resume=1";
      return;
    }
    location.href = "./auth.html?as=professional&mode=signin";
    return;
  }
  await maybeProvisionAfterEmailConfirm(session);
  stripDashboardAuthParams();
  await refreshUI(session, { full: true });
}

boot();
