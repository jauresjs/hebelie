import { applyDocumentI18n, initI18n, localePath, t } from "./i18n.js?v=17";
import { ready, supabase } from "./supabase.js?v=17";

const TZ = "America/Toronto";
const WORK_START = 9;
const WORK_END = 17;
const SLOT_MIN = 30;
const DAYS_AHEAD = 21;
const MIN_LEAD_MS = 24 * 60 * 60 * 1000;

const forceLocale = document.documentElement.dataset.locale;
await initI18n(forceLocale === "fr" || forceLocale === "en" ? { force: forceLocale } : {});
applyDocumentI18n("bookCall");

const $ = (s) => document.querySelector(s);

/** @type {{ date: string, times: string[] }[]} */
let dayOptions = [];
/** @type {string | null} */
let selectedDate = null;
/** @type {string | null} */
let selectedTime = null;

function torontoParts(fromMs) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(new Date(fromMs));
  /** @type {Record<string, string>} */
  const p = {};
  for (const x of parts) if (x.type !== "literal") p[x.type] = x.value;
  return p;
}

function buildTimeList() {
  const out = [];
  for (let m = WORK_START * 60; m < WORK_END * 60; m += SLOT_MIN) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return out;
}

const ALL_TIMES = buildTimeList();

function isWeekday(parts) {
  const wd = parts.weekday?.toLowerCase() ?? "";
  return !wd.startsWith("sat") && !wd.startsWith("sun");
}

function buildDays() {
  const seen = new Set();
  dayOptions = [];
  const start = Date.now();
  for (let i = 0; i < DAYS_AHEAD + 7 && dayOptions.length < DAYS_AHEAD; i++) {
    const ms = start + i * 86400000;
    const parts = torontoParts(ms);
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    if (seen.has(date)) continue;
    seen.add(date);
    if (!isWeekday(parts)) continue;
    dayOptions.push({ date, parts });
  }
}

function slotInstantMs(date, time) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
  for (let offset = -720; offset <= 720; offset += 15) {
    const cand = utcGuess + offset * 60000;
    const p = torontoParts(cand);
    const ds = `${p.year}-${p.month}-${p.day}`;
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const tp = fmt.formatToParts(new Date(cand));
    let hh = "";
    let mm = "";
    for (const x of tp) {
      if (x.type === "hour") hh = x.value;
      if (x.type === "minute") mm = x.value;
    }
    const ts = `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}`;
    if (ds === date && ts === time) return cand;
  }
  return utcGuess;
}

function formatTimeLabel(date, time) {
  const ms = slotInstantMs(date, time);
  return new Intl.DateTimeFormat(document.documentElement.lang === "fr" ? "fr-CA" : "en-CA", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function formatDayLabel(entry) {
  const ms = slotInstantMs(entry.date, "12:00");
  const dow = new Intl.DateTimeFormat(document.documentElement.lang === "fr" ? "fr-CA" : "en-CA", {
    timeZone: TZ,
    weekday: "short",
  }).format(new Date(ms));
  const dom = new Intl.DateTimeFormat(document.documentElement.lang === "fr" ? "fr-CA" : "en-CA", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
  }).format(new Date(ms));
  return { dow, dom };
}

function renderDays() {
  const strip = $("#dayStrip");
  if (!strip) return;
  strip.innerHTML = dayOptions
    .map((entry) => {
      const { dow, dom } = formatDayLabel(entry);
      const pressed = selectedDate === entry.date;
      return `<button type="button" class="day-btn" data-date="${entry.date}" aria-pressed="${pressed}">
<span class="dow">${dow}</span><span class="dom">${dom}</span></button>`;
    })
    .join("");
  strip.querySelectorAll(".day-btn").forEach((btn) => {
    btn.onclick = () => {
      selectedDate = btn.dataset.date ?? null;
      selectedTime = null;
      renderDays();
      renderTimes();
      updateSummary();
      syncSubmit();
    };
  });
}

function renderTimes() {
  const grid = $("#timeGrid");
  if (!grid) return;
  if (!selectedDate) {
    grid.innerHTML = `<p class="tz-note">${t("bookCall.pickDayFirst")}</p>`;
    return;
  }
  const now = Date.now();
  grid.innerHTML = ALL_TIMES.map((time) => {
    const ms = slotInstantMs(selectedDate, time);
    const tooSoon = ms < now + MIN_LEAD_MS;
    const pressed = selectedTime === time;
    const label = formatTimeLabel(selectedDate, time);
    return `<button type="button" class="time-btn" data-time="${time}" aria-pressed="${pressed}"${tooSoon ? " disabled" : ""}>${label}</button>`;
  }).join("");
  grid.querySelectorAll(".time-btn").forEach((btn) => {
    btn.onclick = () => {
      if (btn.disabled) return;
      selectedTime = btn.dataset.time ?? null;
      renderTimes();
      updateSummary();
      syncSubmit();
    };
  });
}

function updateSummary() {
  const el = $("#slotSummary");
  if (!el) return;
  if (!selectedDate || !selectedTime) {
    el.hidden = true;
    return;
  }
  const ms = slotInstantMs(selectedDate, selectedTime);
  const when = new Intl.DateTimeFormat(document.documentElement.lang === "fr" ? "fr-CA" : "en-CA", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(ms));
  el.hidden = false;
  el.innerHTML = `<strong>${t("bookCall.summaryLabel")}</strong>${when}`;
}

function syncSubmit() {
  const btn = $("#submitBtn");
  const form = $("#bookForm");
  if (!btn || !form) return;
  const ok =
    selectedDate &&
    selectedTime &&
    /** @type {HTMLInputElement} */ ($("#name"))?.value.trim() &&
    /** @type {HTMLInputElement} */ ($("#clinic"))?.value.trim() &&
    /** @type {HTMLInputElement} */ ($("#email"))?.value.trim();
  btn.disabled = !ok;
}

async function onSubmit(e) {
  e.preventDefault();
  const msg = $("#formMsg");
  const btn = $("#submitBtn");
  const hp = /** @type {HTMLInputElement} */ ($("#company"));
  if (hp?.value) return;

  if (!ready || !supabase) {
    if (msg) msg.textContent = t("bookCall.errorConfig");
    return;
  }
  if (!selectedDate || !selectedTime) return;

  btn.disabled = true;
  if (msg) msg.textContent = t("bookCall.sending");

  const body = {
    name: /** @type {HTMLInputElement} */ ($("#name")).value.trim(),
    clinic: /** @type {HTMLInputElement} */ ($("#clinic")).value.trim(),
    email: /** @type {HTMLInputElement} */ ($("#email")).value.trim(),
    note: /** @type {HTMLTextAreaElement} */ ($("#note")).value.trim(),
    date: selectedDate,
    time: selectedTime,
    timezone: TZ,
    locale: document.documentElement.lang === "fr" ? "fr" : "en",
  };

  try {
    const { data, error } = await supabase.functions.invoke("book-onboarding-call", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    $("#bookCard")?.setAttribute("hidden", "");
    const ok = $("#successPanel");
    if (ok) ok.hidden = false;
    if (msg) msg.textContent = "";
  } catch {
    if (msg) msg.textContent = t("bookCall.errorSend");
    btn.disabled = false;
  }
}

function init() {
  const back = $(".back");
  if (back) back.setAttribute("href", localePath("/"));

  buildDays();
  if (dayOptions.length) {
    selectedDate = dayOptions[0].date;
  }
  renderDays();
  renderTimes();
  updateSummary();

  $("#bookForm")?.addEventListener("submit", onSubmit);
  ["#name", "#clinic", "#email"].forEach((sel) => {
    $(sel)?.addEventListener("input", syncSubmit);
  });
  syncSubmit();
}

init();
