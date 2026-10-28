import { BILLING_PLANS } from "./billing-plans.js";
import { billingCurrencyForCountry, shortPriceSuffix } from "./billing-locale.js";
import { initGeoCountryHint, peekGeoCountry } from "./geo-hint.js";
import { localeHref, planDescription, planName, t } from "./i18n.js?v=4";

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
    const badge = p.recommended
      ? `<span class="${badgeClass}">${escapeHtml(t("plan.recommended"))}</span>`
      : "";
    const href = localeHref(
      `/auth.html?as=professional&plan=${encodeURIComponent(p.id)}`,
    );
    return `<article class="${cardClass}${rec}">
${badge}
<h3>${escapeHtml(planName(p.id))}</h3>
<p class="plan-price">$${p.monthlyAmount} <small>${suffix}</small></p>
<ul>
<li><strong>${p.previews}</strong> ${escapeHtml(t("plan.previews"))}</li>
<li>${escapeHtml(t("plan.feature.embed"))}</li>
<li>${escapeHtml(planDescription(p.id))}</li>
</ul>
<a class="btn${p.recommended ? "" : " ghost"}" href="${href}">${escapeHtml(t("plan.getStarted"))}</a>
</article>`;
  }).join("");
}

export async function initLandingPricing(grid, footnoteEl, opts = {}) {
  await initGeoCountryHint();
  const currency = landingPricingCurrency();
  renderPublicPlanGrid(grid, { currency, ...opts });

  const heroLead =
    document.getElementById("homePricingLead") ||
    document.getElementById("pricingPageLead") ||
    document.querySelector(".pricing-band .lead, header.hero .lead");
  if (heroLead) {
    const pricingPage = Boolean(document.getElementById("pricingPageLead"));
    heroLead.textContent =
      currency === "cad"
        ? t(pricingPage ? "pricingPage.leadCad" : "pricing.leadCad")
        : t(pricingPage ? "pricingPage.leadUsd" : "pricing.leadUsd");
  }

  if (footnoteEl && currency === "usd") {
    const extra = t("pricing.leadUsdFootnote");
    if (extra && !footnoteEl.textContent.includes("USD")) {
      footnoteEl.append(document.createTextNode(extra));
    }
  }
  return currency;
}
