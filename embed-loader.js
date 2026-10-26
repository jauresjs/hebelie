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
  const url = `${base}/embed.html?clinic=${encodeURIComponent(slug)}&source=${source}`;
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

  root.innerHTML = `
<style>
  *{box-sizing:border-box}
  .backdrop{position:fixed;inset:0;background:rgba(20,20,18,.45);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,-apple-system,sans-serif}
  .card{position:relative;max-width:22rem;width:100%;background:#FAF8F4;color:#141412;border:1px solid #E0DBD2;padding:28px 24px 24px;box-shadow:0 24px 48px rgba(0,0,0,.12)}
  .close{position:absolute;top:12px;right:12px;width:36px;height:36px;border:0;background:transparent;color:#6E6A63;font-size:1.4rem;line-height:1;cursor:pointer;border-radius:4px}
  .close:hover{color:#141412}
  h2{margin:0 0 10px;font:400 1.35rem/1.25 Georgia,"Times New Roman",serif;letter-spacing:.02em}
  p{margin:0 0 20px;font-size:.92rem;line-height:1.5;color:#6E6A63}
  .cta{display:flex;flex-direction:column;gap:10px}
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
    <p>${clinicName} offers a private preview on your own photo before you book.</p>
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
