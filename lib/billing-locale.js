/** @typedef {"cad" | "usd" | "eur"} BillingCurrency */

export const GEO_COUNTRY_KEY = "hebelie_geo_country";

/** EU + EEA (excl. GB) — same numeric plan amounts billed in EUR via Stripe. */
export const EUR_BILLING_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
  "CH",
]);

/** Same numeric amounts; CA → CAD, listed Europe → EUR, else USD. */
export function billingCurrencyForCountry(countryCode) {
  const c = String(countryCode ?? "")
    .trim()
    .toUpperCase();
  if (c === "CA") return "cad";
  if (EUR_BILLING_COUNTRIES.has(c)) return "eur";
  return "usd";
}

/** @param {BillingCurrency} currency */
export function currencyLabel(currency) {
  if (currency === "cad") return "CAD";
  if (currency === "eur") return "EUR";
  return "USD";
}

/** @param {number} amount @param {BillingCurrency} currency */
export function formatPlanPrice(amount, currency) {
  return `${formatPlanPriceAmount(amount, currency)} ${currencyLabel(currency)} / month`;
}

/** @param {number} amount @param {BillingCurrency} currency */
export function formatPlanPriceAmount(amount, currency) {
  if (currency === "eur") return `€${amount}`;
  return `$${amount}`;
}

/** @param {BillingCurrency} currency */
export function shortPriceSuffix(currency) {
  if (currency === "cad") return "CAD/mo";
  if (currency === "eur") return "EUR/mo";
  return "USD/mo";
}

/**
 * Public landing/pricing cards: show CAD/EUR labels only when geo IP is CA / EUR billing region.
 * Otherwise same $ amounts with no "USD" label (checkout still uses clinic signup country).
 * @param {string | null | undefined} geoCountryCode ISO 3166-1 alpha-2 from IP hint, or null
 * @returns {{ currency: BillingCurrency, suffix: string }}
 */
export function landingPriceDisplay(geoCountryCode) {
  const geo =
    geoCountryCode && /^[A-Z]{2}$/.test(String(geoCountryCode).trim().toUpperCase())
      ? String(geoCountryCode).trim().toUpperCase()
      : null;
  if (geo === "CA") return { currency: "cad", suffix: "CAD/mo" };
  if (geo && EUR_BILLING_COUNTRIES.has(geo)) return { currency: "eur", suffix: "EUR/mo" };
  return { currency: "usd", suffix: "/mo" };
}

export const SIGNUP_COUNTRIES = [
  { code: "CA", name: "Canada" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "MX", name: "Mexico" },
  { code: "OTHER", name: "Other country" },
];

export const US_STATES = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "District of Columbia"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
];

export const CA_PROVINCES = [
  ["AB", "Alberta"],
  ["BC", "British Columbia"],
  ["MB", "Manitoba"],
  ["NB", "New Brunswick"],
  ["NL", "Newfoundland and Labrador"],
  ["NS", "Nova Scotia"],
  ["NT", "Northwest Territories"],
  ["NU", "Nunavut"],
  ["ON", "Ontario"],
  ["PE", "Prince Edward Island"],
  ["QC", "Quebec"],
  ["SK", "Saskatchewan"],
  ["YT", "Yukon"],
];

export function regionLabelForCountry(countryCode) {
  const c = String(countryCode ?? "").toUpperCase();
  if (c === "CA") return "Province or territory";
  if (c === "US") return "State";
  return "State / province / region";
}

export function regionsForCountry(countryCode) {
  const c = String(countryCode ?? "").toUpperCase();
  if (c === "US") return US_STATES;
  if (c === "CA") return CA_PROVINCES;
  return null;
}

export function requiresRegionDropdown(countryCode) {
  const c = String(countryCode ?? "").toUpperCase();
  return c === "US" || c === "CA";
}

export function normalizeBillingCountry(code) {
  const raw = String(code ?? "").trim().toUpperCase();
  if (raw === "OTHER") return "US";
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  return "US";
}
