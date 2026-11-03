/** @typedef {"en"|"fr"} EmbedLocale */

const EN_BUTTON = "Preview treatments";
const FR_BUTTON = "Aperçu des traitements";

/** @param {unknown} value @returns {EmbedLocale} */
export function normalizeEmbedLocale(value) {
  return String(value || "").toLowerCase() === "fr" ? "fr" : "en";
}

/** @param {string|null|undefined} region */
export function isQuebecRegion(region) {
  const r = String(region || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return r === "QC" || r === "QUEBEC";
}

/** @param {string|null|undefined} country */
export function isCanadaBillingCountry(country) {
  return String(country ?? "").trim().toUpperCase() === "CA";
}

/**
 * @param {string|null|undefined} country ISO-2
 * @param {string|null|undefined} region province / state
 * @returns {EmbedLocale}
 */
export function defaultEmbedLocaleForClinic(country, region) {
  if (!isCanadaBillingCountry(country)) return "en";
  return isQuebecRegion(region) ? "fr" : "en";
}

/** @param {EmbedLocale} locale */
export function defaultEmbedButtonLabel(locale) {
  return locale === "fr" ? FR_BUTTON : EN_BUTTON;
}

/** @param {string} url @returns {EmbedLocale|null} */
export function inferEmbedLocaleFromWebsite(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  let u;
  try {
    u = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();
  const full = `${host}${path}${u.search}`.toLowerCase();

  if (
    host.endsWith(".qc.ca") ||
    /(^|[/?&])(fr|fr-ca|fr_ca)([/?&]|$)/.test(full) ||
    /\/fr(\/|$)/.test(path) ||
    u.searchParams.get("lang") === "fr"
  ) {
    return "fr";
  }
  if (host.endsWith(".fr") || host.endsWith(".quebec")) return "fr";
  return "en";
}

/** @param {EmbedLocale} locale */
export function embedLangQuery(locale) {
  return locale === "fr" ? "lang=fr" : "";
}

/**
 * @param {string} baseUrl embed.html?clinic=…
 * @param {EmbedLocale} locale
 */
export function withEmbedLang(baseUrl, locale) {
  if (locale !== "fr") return baseUrl;
  const join = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${join}lang=fr`;
}

const EMBED_LANG_SESSION_PREFIX = "hebelie_embed_lang:";

/** @param {string} slug */
export function embedLangSessionKey(slug) {
  return `${EMBED_LANG_SESSION_PREFIX}${String(slug || "").toLowerCase()}`;
}

/** @param {string} slug @returns {EmbedLocale|null} */
export function readEmbedLangOverride(slug) {
  if (!slug) return null;
  try {
    const v = sessionStorage.getItem(embedLangSessionKey(slug));
    if (v === "fr" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return null;
}

/** @param {string} slug @param {EmbedLocale} locale */
export function writeEmbedLangOverride(slug, locale) {
  if (!slug) return;
  try {
    sessionStorage.setItem(embedLangSessionKey(slug), normalizeEmbedLocale(locale));
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ urlLang?: string|null, sessionLang?: EmbedLocale|null, clinicLocale?: unknown }} opts
 * @returns {EmbedLocale}
 */
export function resolveVisitorEmbedLocale(opts) {
  const q = opts.urlLang;
  if (q === "fr" || q === "en") return q;
  const stored = opts.sessionLang;
  if (stored === "fr" || stored === "en") return stored;
  return normalizeEmbedLocale(opts.clinicLocale);
}

/** @param {string} label @param {EmbedLocale} locale */
export function isDefaultEmbedButtonLabel(label, locale) {
  const v = String(label || "").trim();
  if (!v) return true;
  if (locale === "fr") return v === EN_BUTTON || v === FR_BUTTON;
  return v === EN_BUTTON || v === FR_BUTTON;
}
