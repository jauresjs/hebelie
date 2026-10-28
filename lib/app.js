import { CONFIG } from "../config.js";
import { friendly } from "./fal.js";
import { INTENSITIES } from "./prompts.js";
import { setUserIntent } from "./auth-intent.js";
import { applyClinicTheme, clinicSlugFromUrl, fetchClinic } from "./clinic.js?v=14";
import { getSession, onAuth, ready, redirectTo, supabase } from "./supabase.js?v=17";
import {
  clearStage,
  loadStage as loadStageFromStore,
  peekClinicSlug,
  saveStage as saveStageToStore,
} from "./stage-store.js?v=13";
import { applyDocumentI18n, initI18n, intensityLabel, t, treatmentLabel } from "./i18n.js?v=3";

const forceLocale = document.documentElement.dataset.locale;
await initI18n(forceLocale === "fr" || forceLocale === "en" ? { force: forceLocale } : {});
const i18nPage = document.documentElement.dataset.i18nPage;
if (i18nPage) applyDocumentI18n(i18nPage);

const isEmbed = document.body.classList.contains("embed");
const TX_KEYS = ["lips", "cheeks", "botox", "jawline", "skin", "browlift", "facelift", "rhino"];

if (CONFIG.siteUrl && !isEmbed) {
  try {
    const home = new URL(CONFIG.siteUrl);
    if (location.hostname !== home.hostname) {
      location.replace(home.origin + location.pathname + location.search + location.hash);
    }
  } catch {
    /* ignore */
  }
}

const $ = (s) => document.querySelector(s);
const BEFORE = "./before.png?v=5";
const AFTER = "./after.png?v=5";
let intensity = "strong";
const sel = new Set();
let photo = null;
let lastBefore = null;
let lastAfter = null;
let pendingGenerate = false;
let generating = false;
let user = null;
let lastPreviewId = null;
let resumeStarted = false;
let bootstrapped = false;
/** @type {{ id: string, slug: string, name: string } | null} */
let clinic = null;

const img = (s, a) => `<img src="${s}" alt="${a}">`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function scrollToStudio(id = "studio-start") {
  const el = document.getElementById(id) || document.getElementById("studio");
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
}

function oauthReturnUrl() {
  return (
    new URLSearchParams(location.search).has("resume") ||
    /access_token|refresh_token|type=recovery/.test(location.hash)
  );
}

function stripResumeQuery() {
  if (!new URLSearchParams(location.search).has("resume")) return;
  const u = new URL(location.href);
  u.searchParams.delete("resume");
  history.replaceState(null, "", u.pathname + u.search + u.hash);
}

async function waitForSession() {
  let session = await getSession();
  if (session || !supabase) return session;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 10000);
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (s && (event === "INITIAL_SESSION" || event === "SIGNED_IN")) {
        clearTimeout(timer);
        data.subscription.unsubscribe();
        resolve(s);
      }
    });
  });
}

function bindStudioLinks() {
  document.querySelectorAll('a[href="#studio"], a[href="#studio-start"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      if (isEmbed) showEmbedStudio();
      scrollToStudio("studio-start");
    });
  });
}

function shouldSkipEmbedIntro() {
  if (!isEmbed) return false;
  const q = new URLSearchParams(location.search);
  if (q.get("start") === "studio") return true;
  if (q.has("resume")) return true;
  return oauthReturnUrl();
}

function showEmbedStudio() {
  const welcome = $("#embedWelcome");
  const studio = $("#studio");
  if (welcome) welcome.hidden = true;
  if (studio) studio.hidden = false;
}

function initEmbedWelcome() {
  if (!isEmbed) return;
  if (shouldSkipEmbedIntro()) {
    showEmbedStudio();
    return;
  }
  const studio = $("#studio");
  if (studio) studio.hidden = true;
  const intro = $("#introCmp");
  if (intro) mountCmp(intro, BEFORE, AFTER, { tags: true, drag: true });
  const start = $("#startStudio");
  if (start) {
    start.addEventListener("click", () => {
      showEmbedStudio();
      scrollToStudio("studio-start");
    });
  }
}

function mountCmp(el, b, a, { tags = false, drag = false } = {}) {
  el.className = "cmp";
  el.innerHTML = `<div class="L">${img(b, t("cmp.before"))}</div><div class="L after">${img(a, t("cmp.after"))}</div><div class="bar"></div><div class="knob"></div>${tags ? `<span class="tag b">${t("cmp.before")}</span><span class="tag a">${t("cmp.after")}</span>` : ""}${drag ? `<div class="cmp-drag">${t("cmp.drag")}</div>` : ""}<input type="range" min="0" max="100" value="50" aria-label="${t("cmp.heroAria")}">`;
  const r = el.querySelector("input");
  r.oninput = () => el.style.setProperty("--p", r.value + "%");
  el.style.setProperty("--p", "50%");
}

function studioEmpty() {
  const el = $("#studioCmp");
  el.className = "studio-empty";
  el.innerHTML = `<p>${t("app.studioEmpty")}</p>`;
}

function studioPortrait(url) {
  const el = $("#studioCmp");
  el.className = "studio-portrait cmp";
  el.innerHTML = img(url, t("app.portraitAlt"));
}

function overlay(on, text) {
  const o = $("#studioOverlay");
  o.hidden = !on;
  if (text) $("#overlayMsg").textContent = text;
}

function hideBookPanel() {
  const panel = $("#proPanel");
  if (panel) panel.hidden = true;
}

function showBookPanel(bookingUrl) {
  const panel = $("#proPanel");
  const btn = $("#bookConsult");
  if (!panel || !btn) return;
  const url = (bookingUrl || clinic?.booking_url || "").trim();
  if (!url || !clinic?.id) {
    panel.hidden = true;
    return;
  }
  btn.href = url;
  panel.hidden = false;
}

async function persistStage(pending) {
  try {
    await saveStageToStore({
      photo,
      treatments: [...sel],
      pending,
      intensity,
      clinicSlug: clinic?.slug ?? clinicSlugFromUrl() ?? peekClinicSlug(),
    });
  } catch {
    $("#status").textContent = t("app.sessionSaveFail");
  }
}

async function ensureClinic(slugHint) {
  const slug = (slugHint || clinicSlugFromUrl() || peekClinicSlug() || "").trim().toLowerCase();
  if (!slug) {
    if (isEmbed) {
      const st = $("#status");
      if (st) st.textContent = t("app.embedClinicHint");
      const go = $("#go");
      if (go) go.disabled = true;
      const nameEl = $("#embedName");
      if (nameEl) nameEl.textContent = t("app.previewUnavailable");
    }
    return false;
  }
  if (clinic?.slug === slug) return true;
  clinic = await fetchClinic(slug);
  if (!clinic) {
    if ($("#status")) $("#status").textContent = t("app.linkUnavailable");
    if ($("#go")) $("#go").disabled = true;
    return false;
  }
  applyClinicTheme(clinic);
  return true;
}

function applyStage(st) {
  if (!st) return;
  if (st.photo) {
    photo = st.photo;
    $("#pstate").textContent = t("app.portraitReady");
    studioPortrait(photo);
  }
  if (Array.isArray(st.treatments)) {
    sel.clear();
    st.treatments.forEach((k) => sel.add(k));
    draw();
  }
  if (st.intensity && INTENSITIES.includes(st.intensity)) {
    intensity = st.intensity;
    drawIntensity();
  }
  if (st.clinicSlug) void ensureClinic(st.clinicSlug);
  if (st.pending) pendingGenerate = true;
}

async function openAuth() {
  await persistStage(true);
  $("#authDlg").showModal();
  $("#authMsg").textContent = "";
}

async function handlePendingGenerate() {
  if (resumeStarted || generating) return;
  if (!pendingGenerate) return;
  const session = await getSession();
  if (!session) return;

  user = session.user;
  if (!photo || !sel.size) {
    pendingGenerate = false;
    $("#status").textContent = t("app.signInComplete");
    return;
  }

  resumeStarted = true;
  pendingGenerate = false;
  closeAuth();
  scrollToStudio("studioCmp");
  await runGenerate();
}

function closeAuth() {
  $("#authDlg").close();
}

function setAuthMsg(text) {
  $("#authMsg").textContent = text || "";
}

function drawIntensity() {
  $("#intensityChips").innerHTML = INTENSITIES.map(
    (k) =>
      `<button type="button" class="chip" data-intensity="${k}" aria-pressed="${intensity === k}">${intensityLabel(k)}</button>`
  ).join("");
  document.querySelectorAll("[data-intensity]").forEach((c) => {
    c.onclick = () => {
      intensity = c.dataset.intensity;
      drawIntensity();
    };
  });
}

function draw() {
  $("#chips").innerHTML = TX_KEYS.map(
    (k) =>
      `<button class="chip" data-k="${k}" aria-pressed="${sel.has(k)}"${sel.size >= 3 && !sel.has(k) ? " disabled" : ""}>${treatmentLabel(k)}</button>`,
  ).join("");
  document.querySelectorAll(".chip").forEach((c) => {
    c.onclick = () => {
      const k = c.dataset.k;
      if (sel.has(k)) sel.delete(k);
      else if (sel.size < 3) sel.add(k);
      draw();
    };
  });
}

function load(e) {
  const f = e.target.files[0];
  if (!f) return;
  hideBookPanel();
  $("#strip").innerHTML = "";
  const im = new Image();
  const u = URL.createObjectURL(f);
  im.onload = () => {
    const c = document.createElement("canvas");
    const s = Math.min(1, 1024 / Math.max(im.width, im.height));
    c.width = im.width * s;
    c.height = im.height * s;
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    photo = c.toDataURL("image/jpeg", 0.9);
    URL.revokeObjectURL(u);
    $("#pstate").textContent = t("app.portraitReady");
    studioPortrait(photo);
    $("#status").textContent = t("app.readyCompose");
    scrollToStudio("studioCmp");
  };
  im.src = u;
}

async function runGenerate() {
  if (generating) return;
  generating = true;
  const keys = [...sel];
  const st = $("#status");
  const b = $("#go");
  b.disabled = true;
  hideBookPanel();

  const M = [1, 2, 3, 4, 5].map((i) => t(`app.overlay.${i}`));
  let mi = 0;
  overlay(true, M[0]);
  st.textContent = "";
  const tick = setInterval(() => overlay(true, M[Math.min(++mi, M.length - 1)]), 3200);

  try {
    const { data, error } = await supabase.functions.invoke("create-preview", {
      body: {
        treatments: keys,
        image: photo,
        intensity,
        clinic_slug: clinic?.slug ?? null,
      },
    });
    if (error || !data?.afterUrl) {
      throw { kind: data?.error || "failed", status: 0, detail: data };
    }

    clearInterval(tick);
    overlay(false);
    lastBefore = photo;
    lastAfter = data.afterUrl;
    lastPreviewId = data.previewId ?? null;
    mountCmp($("#studioCmp"), lastBefore, lastAfter, { tags: true, drag: true });
    await clearStage();
    const name = keys.map((k) => treatmentLabel(k)).join(" · ");
    st.textContent = t("app.previewReady", { name });
    showBookPanel(data.bookingUrl);
    const t = document.createElement("button");
    t.textContent = name;
    t.onclick = () =>
      mountCmp($("#studioCmp"), lastBefore, lastAfter, { tags: true, drag: true });
    $("#strip").appendChild(t);
    scrollToStudio("studioCmp");
  } catch (e) {
    clearInterval(tick);
    overlay(false);
    const code = e?.kind || e?.detail?.error;
    let msg =
      typeof e?.message === "string" && e.message.includes("JWT")
        ? t("app.signInAgain")
        : friendly(e) || t("app.previewFail");
    if (code === "subscription_required") msg = t("app.subRequired");
    else if (code === "quota_exceeded") msg = t("app.quotaExceeded");
    else if (code === "visitor_daily_limit") msg = t("app.visitorLimit");
    st.textContent = msg;
    scrollToStudio("studioCmp");
  }
  b.disabled = false;
  generating = false;
}

async function onCompose() {
  const keys = [...sel];
  const st = $("#status");
  if (!keys.length) {
    st.textContent = t("app.selectTreatment");
    return;
  }
  if (!photo) {
    st.textContent = t("app.addPortrait");
    return;
  }
  if (!ready) {
    st.textContent = t("app.notConfigured");
    return;
  }

  const session = await getSession();
  if (!session) {
    pendingGenerate = true;
    await persistStage(true);
    const b = $("#go");
    b.disabled = true;
    scrollToStudio("studioCmp");
    overlay(true, t("app.preparing"));
    st.textContent = "";
    await sleep(4000);
    overlay(false);
    b.disabled = false;
    await openAuth();
    return;
  }
  user = session.user;
  await runGenerate();
}

const formEl = $("#form");

document.querySelectorAll("label.btn").forEach((l) => {
  l.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      l.click();
    }
  };
});

$("#cam").onchange = load;
$("#up").onchange = load;
$("#go").onclick = onCompose;

async function signInWithProvider(provider, scopes) {
  setUserIntent();
  await persistStage(true);
  setAuthMsg("");
  const options = { redirectTo: redirectTo() };
  if (scopes) options.scopes = scopes;
  const { error } = await supabase.auth.signInWithOAuth({ provider, options });
  if (error) setAuthMsg(error.message);
}

$("#authGoogle").onclick = () => signInWithProvider("google");

$("#authEmail").onsubmit = async (e) => {
  e.preventDefault();
  setUserIntent();
  await persistStage(true);
  setAuthMsg("");
  const email = $("#authEmailInput").value.trim();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo(),
      data: { hebelie_role: "user" },
    },
  });
  if (error) {
    setAuthMsg(error.message);
    return;
  }
  $("#authEmailInput").readOnly = true;
  e.target.querySelector('button[type="submit"]').disabled = true;
  $("#authGoogle").disabled = true;
  setAuthMsg(t("app.authEmailSent"));
};

if (formEl) {
  formEl.onsubmit = (e) => {
    e.preventDefault();
    e.target.style.display = "none";
    $("#thanks").style.display = "block";
  };
}

onAuth(async (session) => {
  user = session?.user ?? null;
  if (!bootstrapped) return;
  await handlePendingGenerate();
});

async function resumeAfterAuth() {
  const st = await loadStageFromStore();
  applyStage(st);

  const fromOAuth = oauthReturnUrl() || pendingGenerate;
  if (fromOAuth) scrollToStudio("studioCmp");

  const s = await waitForSession();
  if (s) user = s.user;

  stripResumeQuery();
  bootstrapped = true;
  if (isEmbed && (photo || pendingGenerate || lastAfter)) showEmbedStudio();
  await handlePendingGenerate();
}

async function boot() {
  await ensureClinic();
  initEmbedWelcome();
  const hero = $("#heroCmp");
  if (hero) mountCmp(hero, BEFORE, AFTER, { drag: true });
  studioEmpty();
  hideBookPanel();
  draw();
  drawIntensity();
  bindStudioLinks();
  await resumeAfterAuth();
}

boot();
