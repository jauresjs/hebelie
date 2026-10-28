import { BILLING_PLANS } from "./billing-plans.js";
import { billingCurrencyForCountry, peekGeoCountry, shortPriceSuffix } from "./billing-locale.js";
import { initGeoCountryHint } from "./geo-hint.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {"cad" | "usd"} currency */
export function landingPricingCurrency() {
  const geo = peekGeoCountry();
  return billingCurrencyForCountry(geo ?? "US");
}

/**
 * @param {HTMLElement | null} grid
 * @param {{ currency: "cad" | "usd", cardClass?: string, badgeClass?: string }} opts
 */
export function renderPublicPlanGrid(grid, opts) {
  if (!grid) return;
  const currency = opts.currency;
  const suffix = shortPriceSuffix(currency);
  const cardClass = opts.cardClass ?? "plan-card";
  const badgeClass = opts.badgeClass ?? "plan-badge";

  grid.innerHTML = BILLING_PLANS.map((p) => {
    const rec = p.recommended ? " rec" : "";
    const badge = p.recommended ? `<span class="${badgeClass}">Recommended</span>` : "";
    const href = `./auth.html?as=professional&plan=${encodeURIComponent(p.id)}`;
    return `<article class="${cardClass}${rec}">
${badge}
<h3>${escapeHtml(p.name)}</h3>
<p class="plan-price">$${p.monthlyAmount} <small>${suffix}</small></p>
<ul>
<li><strong>${p.previews}</strong> previews per month</li>
<li>Website embed &amp; leads dashboard</li>
<li>${escapeHtml(p.description)}</li>
</ul>
<a class="btn${p.recommended ? "" : " ghost"}" href="${href}">Get started</a>
</article>`;
  }).join("");
}

export async function initLandingPricing(grid, footnoteEl, opts = {}) {
  await initGeoCountryHint();
  const currency = landingPricingCurrency();
  renderPublicPlanGrid(grid, { currency, ...opts });

  const heroLead = document.querySelector(".pricing-band .lead, header.hero .lead");
  if (heroLead) {
    heroLead.textContent =
      currency === "cad"
        ? "Monthly plans in Canadian dollars. Each completed patient preview on your website counts toward your quota. Cancel anytime from your dashboard."
        : "Monthly plans in US dollars (same amounts as CAD plans for Canadian clinics). Each completed preview counts toward your quota. Cancel anytime from your dashboard.";
  }

  if (footnoteEl && currency === "usd") {
    const extra = " Prices shown in USD based on your location; Canadian clinics subscribe in CAD.";
    if (!footnoteEl.textContent.includes("USD")) footnoteEl.textContent += extra;
  }
  return currency;
}
