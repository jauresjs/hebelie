import { friendly } from "./fal.js";
import { getSession, onAuth, ready, redirectTo, supabase } from "./supabase.js";

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
const INTENSITY = "medium";
const STAGE_KEY = "hebelie-stage";

const sel = new Set();
let photo = null;
let lastBefore = null;
let lastAfter = null;
let pendingGenerate = false;
let generating = false;
let user = null;
let lastPreviewId = null;

const img = (s, a) => `<img src="${s}" alt="${a}">`;

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

function saveStage() {
  try {
    sessionStorage.setItem(
      STAGE_KEY,
      JSON.stringify({
        photo,
        treatments: [...sel],
        consent: $("#consent").checked,
        pending: true,
      })
    );
  } catch {
    /* quota */
  }
}

function loadStage() {
  try {
    const raw = sessionStorage.getItem(STAGE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(STAGE_KEY);
    const s = JSON.parse(raw);
    if (s.photo) {
      photo = s.photo;
      $("#pstate").textContent = "Portrait ready.";
      studioPortrait(photo);
    }
    if (Array.isArray(s.treatments)) {
      sel.clear();
      s.treatments.forEach((k) => sel.add(k));
      draw();
    }
    if (s.consent) $("#consent").checked = true;
    if (s.pending) pendingGenerate = true;
  } catch {
    /* ignore */
  }
}

function openAuth() {
  saveStage();
  $("#authDlg").showModal();
  $("#authMsg").textContent = "";
}

function closeAuth() {
  $("#authDlg").close();
}

function setAuthMsg(text) {
  $("#authMsg").textContent = text || "";
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
      body: { treatments: keys, image: photo, intensity: INTENSITY },
    });
    if (error) throw { kind: data?.error || "failed", status: 0, detail: data };
    if (!data?.afterUrl) throw { kind: data?.error || "failed", status: 0, detail: data };

    clearInterval(tick);
    overlay(false);
    lastBefore = photo;
    lastAfter = data.afterUrl;
    lastPreviewId = data.previewId ?? null;
    mountCmp($("#studioCmp"), lastBefore, lastAfter, { tags: true, drag: true });
    const name = keys.map((k) => TR[k]).join(" · ");
    st.textContent = "Preview ready — " + name + ". Drag to compare.";
    showProPanel();
    const t = document.createElement("button");
    t.textContent = name;
    t.onclick = () =>
      mountCmp($("#studioCmp"), lastBefore, lastAfter, { tags: true, drag: true });
    $("#strip").appendChild(t);
  } catch (e) {
    clearInterval(tick);
    overlay(false);
    st.textContent =
      typeof e?.message === "string" && e.message.includes("JWT")
        ? "Please sign in again."
        : friendly(e) || "We could not create your preview. Try again.";
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
  if (!$("#consent").checked) {
    st.textContent = "Please agree to the photo processing to continue.";
    return;
  }
  if (!ready) {
    st.textContent = "Preview service is not configured yet.";
    return;
  }

  const session = await getSession();
  if (!session) {
    pendingGenerate = true;
    openAuth();
    return;
  }
  user = session.user;
  await runGenerate();
}

mountCmp($("#heroCmp"), BEFORE, AFTER, { drag: true });
studioEmpty();
hideProPanel();
draw();

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

$("#authGoogle").onclick = async () => {
  saveStage();
  setAuthMsg("");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectTo() },
  });
  if (error) setAuthMsg(error.message);
};

$("#authEmail").onsubmit = async (e) => {
  e.preventDefault();
  saveStage();
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
  };
  if (user?.id) {
    const { error } = await supabase.from("atelier_leads").insert(payload);
    if (error) console.warn("lead save", error.message);
  }
  e.target.hidden = true;
  $("#proThanks").classList.add("on");
};

$("#form").onsubmit = (e) => {
  e.preventDefault();
  e.target.style.display = "none";
  $("#thanks").style.display = "block";
};

onAuth(async (session) => {
  user = session?.user ?? null;
  if (session && pendingGenerate) {
    pendingGenerate = false;
    closeAuth();
    await runGenerate();
  }
});

async function resumeAfterAuth() {
  loadStage();
  const s = await getSession();
  if (s) user = s.user;
  if (pendingGenerate && s && photo && sel.size && $("#consent").checked) {
    pendingGenerate = false;
    closeAuth();
    await runGenerate();
  }
}

resumeAfterAuth();
