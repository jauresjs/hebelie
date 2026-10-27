import { CONFIG } from "../config.js";
import { BILLING_PLANS } from "./billing-plans.js";
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
    embed_button_label: $("#buttonLabel").value.trim() || "Preview treatments",
    embed_button_bg: normalizeHex($("#buttonBgHex").value, "#9A8565"),
    embed_button_text: normalizeHex($("#buttonTextHex").value, "#FFFFFF"),
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
  el.innerHTML = [
    `<strong>Button:</strong> ${escapeHtml(settings.embed_button_label)}`,
    `<strong>Colors:</strong> ${escapeHtml(settings.embed_button_bg)} / ${escapeHtml(settings.embed_button_text)}`,
    `<strong>${escapeHtml(popup)}</strong> · ${escapeHtml(emails)}`,
    `<strong>${escapeHtml(visitor)}</strong>`,
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

function selectTab(which) {
  const tabs = ["leads", "usage", "embed", "billing"];
  const w = tabs.includes(which) ? which : "leads";
  $("#tabLeads").setAttribute("aria-selected", w === "leads" ? "true" : "false");
  $("#tabUsage").setAttribute("aria-selected", w === "usage" ? "true" : "false");
  $("#tabEmbed").setAttribute("aria-selected", w === "embed" ? "true" : "false");
  $("#tabBilling").setAttribute("aria-selected", w === "billing" ? "true" : "false");
  $("#panelLeads").hidden = w !== "leads";
  $("#panelUsage").hidden = w !== "usage";
  $("#panelEmbed").hidden = w !== "embed";
  $("#panelBilling").hidden = w !== "billing";
  if (w === "embed") showEmbedStep(1);
  if (w === "usage") renderUsage();
  if (w === "billing") renderBilling();
}

$("#tabLeads").onclick = () => selectTab("leads");
$("#tabUsage").onclick = () => selectTab("usage");
$("#tabEmbed").onclick = () => selectTab("embed");
$("#tabBilling").onclick = () => selectTab("billing");
$("#usageGoBilling").onclick = () => selectTab("billing");

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

["websiteUrl", "bookingUrl", "buttonLabel"].forEach((id) => {
  $("#" + id)?.addEventListener("input", () => {
    updatePreview();
    updateSnippet();
  });
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
    p_max_previews_per_visitor_per_day: s.visitor_daily_unlimited ? null : s.max_previews_per_visitor_per_day,
    p_clear_visitor_daily_cap: s.visitor_daily_unlimited,
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

function billingActive(c) {
  if (!c) return false;
  if (c.billing_exempt) return true;
  return c.subscription_status === "active" || c.subscription_status === "trialing";
}

function planDisplayName(c) {
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
  const remaining = quota > 0 ? Math.max(0, quota - used) : 0;

  if (active && quota > 0) {
    remainingEl.textContent = String(remaining);
    headlineEl.textContent =
      remaining === 1
        ? "preview left this billing period"
        : "previews left this billing period";
    const pct = Math.min(100, Math.round((used / quota) * 100));
    bar.hidden = false;
    fill.style.width = `${pct}%`;
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
  grid.innerHTML = BILLING_PLANS.map((p) => {
    const current = c?.billing_plan === p.id;
    const rec = p.recommended ? " plan-card rec" : " plan-card";
    return `<div class="${rec.trim()}">
<h4>${escapeHtml(p.name)}${current ? " · current" : ""}</h4>
<p class="price">$${p.priceCad} <span class="meta">CAD/mo</span></p>
<p class="meta">${p.previews} previews / month</p>
<button class="btn ghost" type="button" data-plan="${p.id}" ${current && billingActive(c) ? "disabled" : ""}>
${current && billingActive(c) ? "Current plan" : "Subscribe"}
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

  if (c.billing_exempt) {
    statusEl.textContent = "This clinic is on a demo / exempt account. Previews are not metered.";
    manageBtn.hidden = true;
    picker.hidden = true;
    return;
  }

  const quota = c.preview_quota_monthly ?? 0;
  const active = billingActive(c);
  const planName = planDisplayName(c);

  if (active && quota > 0) {
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
  msg.textContent = "Opening secure checkout…";
  msg.classList.remove("ok");
  const { data, error } = await supabase.functions.invoke("billing-checkout", {
    body: { clinic_id: c.id, plan: planId },
  });
  if (error || data?.error) {
    const code = data?.error;
    const messages = {
      price_not_configured: "Billing is not configured yet. Contact onboarding@hebelie.com.",
      price_mode_mismatch:
        "Stripe test/live mismatch on prices. Check Supabase STRIPE_PRICE_* secrets match your STRIPE_SECRET_KEY mode.",
      unauthorized: "Please sign in again, then retry checkout.",
      forbidden: "You cannot subscribe for this clinic.",
      stripe_failed: "Stripe rejected checkout. Try again or contact onboarding@hebelie.com.",
    };
    msg.textContent = messages[code] ?? "Could not start checkout. Try again.";
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
  const q = new URLSearchParams(location.search);
  const tab = q.get("tab");
  if (tab === "billing" || tab === "usage" || tab === "embed" || tab === "customize") {
    return tab === "customize" ? "embed" : tab;
  }
  return "leads";
}

function pendingCheckoutPlan() {
  return new URLSearchParams(location.search).get("plan");
}

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
  renderUsage();

  const tab = initialDashboardTab();
  selectTab(tab);
  if (new URLSearchParams(location.search).get("checkout") === "success") {
    await reloadClinicsFromServer();
    selectTab(tab);
  }
  const plan = pendingCheckoutPlan();
  if (plan && BILLING_PLANS.some((p) => p.id === plan) && !billingActive(activeClinic())) {
    await startCheckout(plan);
  }
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
