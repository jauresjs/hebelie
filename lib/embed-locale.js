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
  return String(country || "CA").trim().toUpperCase() === "CA";
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

/** @param {string} label @param {EmbedLocale} locale */
export function isDefaultEmbedButtonLabel(label, locale) {
  const v = String(label || "").trim();
  if (!v) return true;
  if (locale === "fr") return v === EN_BUTTON || v === FR_BUTTON;
  return v === EN_BUTTON || v === FR_BUTTON;
}
