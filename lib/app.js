import { CONFIG } from "../config.js";
import { friendly } from "./fal.js";
import { INTENSITIES } from "./prompts.js";
import { applyClinicTheme, clinicSlugFromUrl, fetchClinic } from "./clinic.js?v=11";
import { getSession, onAuth, ready, redirectTo, supabase } from "./supabase.js?v=11";
import {
  clearStage,
  loadStage as loadStageFromStore,
  peekClinicSlug,
  saveStage as saveStageToStore,
} from "./stage-store.js?v=11";

const isEmbed = document.body.classList.contains("embed");

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
const TR = {
  lips: "Lip filler",
  cheeks: "Cheek filler",
  botox: "Botox",
  jawline: "Jawline contour",
  skin: "Skin rejuvenation",
  browlift: "Brow lift",
  facelift: "Facelift",
  rhino: "Rhinoplasty",
};
const INTENSITY_LABEL = { light: "Subtle", medium: "Moderate", strong: "Visible" };
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
      scrollToStudio("studio-start");
    });
  });
}

function mountCmp(el, b, a, { tags = false, drag = false } = {}) {
  el.className = "cmp";
  el.innerHTML = `<div class="L">${img(b, "Before")}</div><div class="L after">${img(a, "After")}</div><div class="bar"></div><div class="knob"></div>${tags ? '<span class="tag b">Before</span><span class="tag a">After</span>' : ""}${drag ? '<div class="cmp-drag">Drag to compare</div>' : ""}<input type="range" min="0" max="100" value="50" aria-label="Compare before and after">`;
  const r = el.querySelector("input");
  r.oninput = () => el.style.setProperty("--p", r.value + "%");
  el.style.setProperty("--p", "50%");
}

function studioEmpty() {
  const el = $("#studioCmp");
  el.className = "studio-empty";
  el.innerHTML = "<p>Upload or capture your portrait to begin.</p>";
}

function studioPortrait(url) {
  const el = $("#studioCmp");
  el.className = "studio-portrait cmp";
  el.innerHTML = img(url, "Your portrait");
}

function overlay(on, text) {
  const o = $("#studioOverlay");
  o.hidden = !on;
  if (text) $("#overlayMsg").textContent = text;
}

function hideProPanel() {
  $("#proPanel").hidden = true;
  $("#proForm").hidden = true;
  $("#proThanks").classList.remove("on");
}

function showProPanel() {
  $("#proPanel").hidden = false;
  $("#proToggle").hidden = false;
  $("#proForm").hidden = true;
  $("#proThanks").classList.remove("on");
  const email = user?.email;
  if (email) {
    const inp = $("#proForm input[name=email]");
    if (inp) {
      inp.value = email;
      inp.readOnly = true;
    }
  }
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
    $("#status").textContent = "Could not save your session. Try again in a normal browser tab.";
  }
}

async function ensureClinic(slugHint) {
  const slug = (slugHint || clinicSlugFromUrl() || peekClinicSlug() || "").trim().toLowerCase();
  if (!slug) {
    if (isEmbed) {
      const st = $("#status");
      if (st) st.textContent = "Add ?clinic=your-slug to this embed URL.";
      const go = $("#go");
      if (go) go.disabled = true;
      const brand = $("#embedBrand");
      if (brand) brand.textContent = "Preview unavailable";
    }
    return false;
  }
  if (clinic?.slug === slug) return true;
  clinic = await fetchClinic(slug);
  if (!clinic) {
    if ($("#status")) $("#status").textContent = "This preview link is not available.";
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
    $("#pstate").textContent = "Portrait ready.";
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
    $("#status").textContent =
      "Sign-in complete. Upload your portrait again if needed, then tap View result.";
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
      `<button type="button" class="chip" data-intensity="${k}" aria-pressed="${intensity === k}">${INTENSITY_LABEL[k]}</button>`
  ).join("");
  document.querySelectorAll("[data-intensity]").forEach((c) => {
    c.onclick = () => {
      intensity = c.dataset.intensity;
      drawIntensity();
    };
  });
}

function draw() {
  $("#chips").innerHTML = Object.keys(TR)
    .map(
      (k) =>
        `<button class="chip" data-k="${k}" aria-pressed="${sel.has(k)}"${sel.size >= 3 && !sel.has(k) ? " disabled" : ""}>${TR[k]}</button>`
    )
    .join("");
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
  hideProPanel();
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
    $("#pstate").textContent = "Portrait ready.";
    studioPortrait(photo);
    $("#status").textContent = "Ready—select treatments, then compose.";
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
  hideProPanel();

  const M = [
    "Reading your features…",
    "Mapping your face…",
    "Sculpting your preview…",
    "Keeping it natural…",
    "Almost there…",
  ];
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
    if (error) throw { kind: data?.error || "failed", status: 0, detail: data };
    if (!data?.afterUrl) throw { kind: data?.error || "failed", status: 0, detail: data };

    clearInterval(tick);
    overlay(false);
    lastBefore = photo;
    lastAfter = data.afterUrl;
    lastPreviewId = data.previewId ?? null;
    mountCmp($("#studioCmp"), lastBefore, lastAfter, { tags: true, drag: true });
    await clearStage();
    const name = keys.map((k) => TR[k]).join(" · ");
    st.textContent = "Preview ready — " + name + ". Drag to compare.";
    showProPanel();
    const t = document.createElement("button");
    t.textContent = name;
    t.onclick = () =>
      mountCmp($("#studioCmp"), lastBefore, lastAfter, { tags: true, drag: true });
    $("#strip").appendChild(t);
    scrollToStudio("studioCmp");
  } catch (e) {
    clearInterval(tick);
    overlay(false);
    st.textContent =
      typeof e?.message === "string" && e.message.includes("JWT")
        ? "Please sign in again."
        : friendly(e) || "We could not create your preview. Try again.";
    scrollToStudio("studioCmp");
  }
  b.disabled = false;
  generating = false;
}

async function onCompose() {
  const keys = [...sel];
  const st = $("#status");
  if (!keys.length) {
    st.textContent = "Select at least one treatment.";
    return;
  }
  if (!photo) {
    st.textContent = "Add your portrait first.";
    return;
  }
  if (!ready) {
    st.textContent = "Preview service is not configured yet.";
    return;
  }

  const session = await getSession();
  if (!session) {
    pendingGenerate = true;
    await persistStage(true);
    const b = $("#go");
    b.disabled = true;
    scrollToStudio("studioCmp");
    overlay(true, "Preparing your preview…");
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
  await persistStage(true);
  setAuthMsg("");
  const options = { redirectTo: redirectTo() };
  if (scopes) options.scopes = scopes;
  const { error } = await supabase.auth.signInWithOAuth({ provider, options });
  if (error) setAuthMsg(error.message);
}

$("#authGoogle").onclick = () => signInWithProvider("google");
$("#authFacebook").onclick = () => signInWithProvider("facebook", "email");

$("#authEmail").onsubmit = async (e) => {
  e.preventDefault();
  await persistStage(true);
  setAuthMsg("");
  const email = $("#authEmailInput").value.trim();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo() },
  });
  if (error) setAuthMsg(error.message);
  else setAuthMsg("Check your email for a sign-in link.");
};

$("#proToggle").onclick = () => {
  $("#proForm").hidden = false;
  $("#proToggle").hidden = true;
};

$("#proForm").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    user_id: user?.id,
    preview_id: lastPreviewId,
    name: String(fd.get("name") || "").trim(),
    email: String(fd.get("email") || "").trim(),
    phone: String(fd.get("phone") || "").trim() || null,
    treatments: [...sel],
    clinic_id: clinic?.id ?? null,
  };
  if (user?.id) {
    const { data: row, error } = await supabase
      .from("atelier_leads")
      .insert(payload)
      .select("id")
      .single();
    if (error) console.warn("lead save", error.message);
    else if (row?.id && clinic?.id) {
      supabase.functions.invoke("notify-lead", { body: { lead_id: row.id } });
    }
  }
  e.target.hidden = true;
  $("#proThanks").classList.add("on");
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
  await handlePendingGenerate();
}

async function boot() {
  await ensureClinic();
  const hero = $("#heroCmp");
  if (hero) mountCmp(hero, BEFORE, AFTER, { drag: true });
  studioEmpty();
  hideProPanel();
  draw();
  drawIntensity();
  bindStudioLinks();
  await resumeAfterAuth();
}

boot();
