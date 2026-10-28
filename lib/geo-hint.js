import { GEO_COUNTRY_KEY } from "./billing-locale.js";

const IPAPI = "https://ipapi.co/country_code/";

/** @returns {Promise<string|null>} ISO 3166-1 alpha-2 or null */
export async function fetchCountryFromIp() {
  try {
    const r = await fetch(IPAPI, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const text = (await r.text()).trim().toUpperCase();
    return /^[A-Z]{2}$/.test(text) ? text : null;
  } catch {
    return null;
  }
}

/** Cache IP country for landing pricing + auth prefill (session only). */
export async function initGeoCountryHint() {
  try {
    const existing = sessionStorage.getItem(GEO_COUNTRY_KEY);
    if (existing && /^[A-Z]{2}$/.test(existing)) return existing;
    const code = await fetchCountryFromIp();
    if (code) sessionStorage.setItem(GEO_COUNTRY_KEY, code);
    return code;
  } catch {
    return null;
  }
}

export function peekGeoCountry() {
  try {
    const c = sessionStorage.getItem(GEO_COUNTRY_KEY);
    return c && /^[A-Z]{2}$/.test(c) ? c : null;
  } catch {
    return null;
  }
}
