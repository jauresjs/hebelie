/**
 * Hebelie site prompt — paste once on the clinic website (see dashboard).
 * Shows an on-site dialog after 3s when embed_auto_prompt is enabled for the clinic.
 */
import { CONFIG } from "./config.js";

const PROMPT_DELAY_MS = 3000;
const DISMISS_DAYS = 7;

function scriptEl() {
  return document.currentScript || document.querySelector('script[src*="embed-loader"]');
}

function clinicSlugFromScript() {
  const el = scriptEl();
  const slug = el?.dataset?.clinic?.trim().toLowerCase();
  return slug || null;
}

function siteOrigin() {
  try {
    return new URL(CONFIG.siteUrl).origin;
  } catch {
    return "https://hebelie.com";
  }
}

async function fetchEmbedConfig(slug) {
  const url = `${CONFIG.supabaseUrl}/rest/v1/rpc/get_clinic_embed_public`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: CONFIG.supabaseAnonKey,
      Authorization: `Bearer ${CONFIG.supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_slug: slug }),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] ?? null;
}

function sessionKey(slug) {
  return `hebelie:auto_prompt:${slug}`;
}

function dismissKey(slug) {
  return `hebelie:auto_prompt_dismiss:${slug}`;
}

function wasShownThisSession(slug) {
  try {
    return sessionStorage.getItem(sessionKey(slug)) === "1";
  } catch {
    return false;
  }
}

function markShownSession(slug) {
  try {
    sessionStorage.setItem(sessionKey(slug), "1");
  } catch {
    /* ignore */
  }
}

function wasDismissedRecently(slug) {
  try {
    const raw = localStorage.getItem(dismissKey(slug));
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

function markDismissed(slug) {
  try {
    localStorage.setItem(dismissKey(slug), String(Date.now() + DISMISS_DAYS * 86400000));
  } catch {
    /* ignore */
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openPreview(slug, label, bg, fg) {
  const base = siteOrigin();
  const source = encodeURIComponent(location.origin);
  const url = `${base}/embed.html?clinic=${encodeURIComponent(slug)}&source=${source}&start=studio`;
  window.open(url, "hebelie", "width=440,height=920,noopener");
}

function mountPrompt(cfg) {
  const slug = cfg.slug;
  const host = document.createElement("div");
  host.id = "hebelie-embed-prompt-root";
  const root = host.attachShadow({ mode: "open" });
  const bg = cfg.embed_button_bg || "#9A8565";
  const fg = cfg.embed_button_text || "#FFFFFF";
  const label = cfg.embed_button_label || "Preview treatments";
  const clinicName = escapeHtml(cfg.name || "Your clinic");
  const labelSafe = escapeHtml(label);
  const origin = siteOrigin();
  const beforeImg = `${origin}/before.png?v=9`;
  const afterImg = `${origin}/after.png?v=9`;

  root.innerHTML = `
<style>
  *{box-sizing:border-box}
  .backdrop{position:fixed;inset:0;background:rgba(20,20,18,.45);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif}
  .card{position:relative;max-width:min(22rem,100%);width:100%;max-height:min(96vh,720px);overflow:auto;background:#FAF8F4;color:#141412;border:1px solid #E0DBD2;padding:24px 20px 20px;box-shadow:0 24px 48px rgba(0,0,0,.12)}
  .close{position:absolute;top:10px;right:10px;width:36px;height:36px;border:0;background:transparent;color:#6E6A63;font-size:1.4rem;line-height:1;cursor:pointer;border-radius:4px;z-index:2}
  .close:hover{color:#141412}
  h2{margin:0 0 12px;padding-right:28px;font:400 1.25rem/1.25 Georgia,"Times New Roman",serif;letter-spacing:.02em;text-align:center}
  p{margin:0 0 16px;font-size:.88rem;line-height:1.5;color:#6E6A63;text-align:center}
  .cmp{position:relative;aspect-ratio:3/4;width:100%;max-height:42vh;margin:0 auto 10px;overflow:hidden;background:#F3F0E8;border:1px solid #E0DBD2;--p:50%}
  .cmp .L{position:absolute;inset:0}
  .cmp .L img{width:100%;height:100%;object-fit:cover;display:block}
  .cmp .after{clip-path:inset(0 0 0 var(--p))}
  .cmp .bar{position:absolute;top:0;bottom:0;left:var(--p);width:1px;background:rgba(255,255,255,.9);pointer-events:none}
  .cmp .knob{position:absolute;top:50%;left:var(--p);width:2px;height:56px;margin:-28px 0 0 -1px;background:#fff;pointer-events:none}
  .cmp input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:ew-resize;margin:0;touch-action:none}
  .cmp-drag,.tag{position:absolute;bottom:12px;font-size:.55rem;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.92);pointer-events:none;z-index:1}
  .cmp-drag{left:50%;transform:translateX(-50%)}
  .tag.b{left:12px}.tag.a{right:12px}
  .cta{display:flex;flex-direction:column;gap:10px;margin-top:4px}
  .btn{display:flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border:1px solid #141412;background:#141412;color:#FAF8F4;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;width:100%}
  .btn.primary{border-color:${bg};background:${bg};color:${fg}}
  .btn.ghost{background:transparent;color:#6E6A63;border-color:transparent;text-transform:none;letter-spacing:0;font-size:.82rem;min-height:40px}
  @media (prefers-reduced-motion:no-preference){
    .backdrop{animation:fadeIn .35s ease}
    .card{animation:rise .4s cubic-bezier(.22,1,.36,1)}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  }
</style>
<div class="backdrop" role="presentation">
  <div class="card" role="dialog" aria-modal="true" aria-labelledby="hbTitle">
    <button type="button" class="close" aria-label="Close">&times;</button>
    <h2 id="hbTitle">See how it could look on you</h2>
    <div class="cmp" aria-label="Example before and after preview">
      <div class="L"><img src="${beforeImg}" alt="Before example"></div>
      <div class="L after"><img src="${afterImg}" alt="After example"></div>
      <div class="bar"></div><div class="knob"></div>
      <span class="tag b">Before</span><span class="tag a">After</span>
      <div class="cmp-drag">Drag to compare</div>
      <input type="range" min="0" max="100" value="50" aria-label="Compare before and after example">
    </div>
    <p>${clinicName} — try a private preview on your own photo.</p>
    <div class="cta">
      <button type="button" class="btn primary">${labelSafe}</button>
      <button type="button" class="btn ghost">Not now</button>
    </div>
  </div>
</div>`;

  function close() {
    host.remove();
    document.removeEventListener("keydown", onKey);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      markDismissed(slug);
      close();
    }
  }

  const backdrop = root.querySelector(".backdrop");
  const closeBtn = root.querySelector(".close");
  const primary = root.querySelector(".btn.primary");
  const ghost = root.querySelector(".btn.ghost");
  const card = root.querySelector(".card");
  const cmp = root.querySelector(".cmp");
  const range = root.querySelector(".cmp input");
  if (cmp && range) {
    range.addEventListener("input", () => cmp.style.setProperty("--p", `${range.value}%`));
    cmp.style.setProperty("--p", "50%");
  }

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      markDismissed(slug);
      close();
    }
  });
  closeBtn.addEventListener("click", () => {
    markDismissed(slug);
    close();
  });
  ghost.addEventListener("click", () => {
    markDismissed(slug);
    close();
  });
  primary.addEventListener("click", () => {
    markShownSession(slug);
    openPreview(slug, label, bg, fg);
    close();
  });
  card.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("keydown", onKey);
  document.body.appendChild(host);
  primary.focus();
}

async function main() {
  const slug = clinicSlugFromScript();
  if (!slug) return;
  if (wasShownThisSession(slug) || wasDismissedRecently(slug)) return;

  const cfg = await fetchEmbedConfig(slug);
  if (!cfg?.embed_auto_prompt) return;

  window.setTimeout(() => {
    if (wasShownThisSession(slug) || wasDismissedRecently(slug)) return;
    if (document.getElementById("hebelie-embed-prompt-root")) return;
    markShownSession(slug);
    mountPrompt(cfg);
  }, PROMPT_DELAY_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void main());
} else {
  void main();
}
