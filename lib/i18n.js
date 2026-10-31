import { en } from "./locales/en.js?v=11";
import { fr } from "./locales/fr.js?v=11";

const STORAGE_KEY = "hebelie_locale";
const SITE = "https://hebelie.com";

const catalogs = { en, fr };

/** @type {"en"|"fr"} */
let locale = "en";

function prefersFrenchFromNavigator() {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  if (langs.some((l) => String(l || "").toLowerCase().startsWith("fr"))) return true;
  const ua = navigator.userAgent || "";
  return /\bfr[-_]?|French|français/i.test(ua);
}

/** @returns {"en"|"fr"} */
export function detectLocale(options = {}) {
  if (options.force === "fr" || options.force === "en") return options.force;

  const htmlLocale = document.documentElement.getAttribute("data-locale");
  if (htmlLocale === "fr" || htmlLocale === "en") return htmlLocale;

  const path = location.pathname.replace(/\\/g, "/");
  if (/\/fr(\/|$)/.test(path)) return "fr";

  const q = new URLSearchParams(location.search).get("lang");
  if (q === "fr" || q === "en") return q;

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === "fr" || stored === "en") return stored;
  } catch {
    /* ignore */
  }

  return prefersFrenchFromNavigator() ? "fr" : "en";
}

export function getLocale() {
  return locale;
}

export function isFrench() {
  return locale === "fr";
}

/** @param {string} key @param {Record<string,string>} [vars] */
export function t(key, vars) {
  const table = catalogs[locale] ?? catalogs.en;
  let s = table[key] ?? catalogs.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, v);
    }
  }
  return s;
}

/** @param {string} path e.g. /auth.html?plan=starter */
export function localePath(path) {
  const raw = path.startsWith("/") ? path : `/${path.replace(/^\.\//, "")}`;
  const u = new URL(raw, SITE);
  let pathname = u.pathname;
  if (pathname === "/index.html") pathname = "/";
  if (locale === "fr") {
    if (pathname === "/") return `/fr/${u.search}${u.hash}`;
    const base = pathname.replace(/^\//, "");
    return `/fr/${base}${u.search}${u.hash}`;
  }
  if (pathname === "/") return `/${u.search}${u.hash}`;
  return `${pathname}${u.search}${u.hash}`;
}

/** @param {string} path */
export function localeHref(path) {
  const p = localePath(path);
  const url = new URL(p, location.origin);
  if (locale === "fr" && !url.pathname.startsWith("/fr")) {
    url.searchParams.set("lang", "fr");
  } else if (locale === "en") {
    url.searchParams.delete("lang");
  }
  return url.pathname + url.search + url.hash;
}

const SEO_ROUTES = [
  { en: "/", fr: "/fr/", page: "index" },
  { en: "/auth.html", fr: "/fr/auth.html", page: "auth" },
  { en: "/pricing.html", fr: "/fr/pricing.html", page: "pricing" },
  { en: "/dashboard.html", fr: "/fr/dashboard.html", page: "dashboard" },
];

export function injectHreflang(currentPage = "index") {
  const route = SEO_ROUTES.find((r) => r.page === currentPage) ?? SEO_ROUTES[0];
  const head = document.head;
  if (!head) return;

  head.querySelectorAll('link[rel="alternate"][data-i18n-hreflang]').forEach((el) => el.remove());

  for (const [lang, path] of [
    ["en", route.en],
    ["fr", route.fr],
    ["x-default", route.en],
  ]) {
    const link = document.createElement("link");
    link.rel = "alternate";
    link.hreflang = lang;
    link.href = `${SITE}${path === "/" ? "/" : path}`;
    link.dataset.i18nHreflang = "1";
    head.appendChild(link);
  }

  let canonical = head.querySelector('link[rel="canonical"][data-i18n-canonical]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    canonical.dataset.i18nCanonical = "1";
    head.appendChild(canonical);
  }
  canonical.href = `${SITE}${locale === "fr" ? route.fr : route.en}`;
}

function applyMeta(page) {
  const titleKey =
    page === "auth"
      ? "meta.auth.title"
      : page === "pricing"
        ? "meta.pricing.title"
        : page === "dashboard"
          ? "meta.dashboard.title"
          : locale === "fr"
            ? "meta.fr.index.title"
            : "meta.index.title";
  const descKey =
    page === "pricing"
      ? "meta.pricing.description"
      : page === "index"
        ? locale === "fr"
          ? "meta.fr.index.description"
          : "meta.index.description"
        : null;

  document.title = t(titleKey);
  if (descKey) {
    let meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", t(descKey));
  }
  document.documentElement.lang = locale === "fr" ? "fr" : "en";
}

export function applyDocumentI18n(page = "index") {
  applyMeta(page);
  injectHreflang(page);

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    if (key) el.innerHTML = t(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.setAttribute("placeholder", t(key));
  });

  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (key) el.setAttribute("aria-label", t(key));
  });

  document.querySelectorAll("[data-locale-href]").forEach((el) => {
    const path = el.getAttribute("data-locale-href");
    if (path) el.setAttribute("href", localeHref(path));
  });

  document.querySelectorAll("summary[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-next]").forEach((el) => {
    const key = el.getAttribute("data-i18n-next");
    if (key && el.tagName === "P") el.textContent = t(key);
  });
}

/** @type {Promise<"en"|"fr"> | null} */
let initPromise = null;

async function _initI18n(options = {}) {
  locale = detectLocale(options);
  try {
    sessionStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  return locale;
}

export function initI18n(options = {}) {
  if (!initPromise || options.force) {
    initPromise = _initI18n(options);
  }
  return initPromise;
}

/** @returns {string} prefix "" or "../" when page lives under /fr/ */
export function assetPrefix() {
  return /\/fr(\/|$)/.test(location.pathname.replace(/\\/g, "/")) ? "../" : "./";
}

export function treatmentLabel(key) {
  return t(`tx.${key}`);
}

export function intensityLabel(key) {
  return t(`intensity.${key}`);
}

export function planDescription(planId) {
  return t(`plan.${planId}.desc`);
}

export function planName(planId) {
  return t(`plan.${planId}.name`);
}
