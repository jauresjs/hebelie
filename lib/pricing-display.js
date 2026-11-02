import { BILLING_PLANS } from "./billing-plans.js";
import { formatPlanPriceAmount, landingPriceDisplay } from "./billing-locale.js";
import { initGeoCountryHint, peekGeoCountry } from "./geo-hint.js";
import { localeHref, planDescription, planName, t } from "./i18n.js?v=31";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {"cad" | "usd" | "eur"} currency */
export function landingPricingCurrency() {
  return landingPriceDisplay(peekGeoCountry()).currency;
}

/**
 * @param {HTMLElement | null} grid
 * @param {{ currency: "cad" | "usd" | "eur", suffix?: string, cardClass?: string, badgeClass?: string }} opts
 */
export function renderPublicPlanGrid(grid, opts) {
  if (!grid) return;
  const currency = opts.currency;
  const suffix = opts.suffix ?? "/mo";
  const cardClass = opts.cardClass ?? "plan-card";
  const badgeClass = opts.badgeClass ?? "plan-badge";

  grid.innerHTML = BILLING_PLANS.map((p) => {
    const rec = p.recommended ? " rec" : "";
    const badge = p.recommended
      ? `<span class="${badgeClass}">${escapeHtml(t("plan.recommended"))}</span>`
      : "";
    const href = localeHref(
      `/auth.html?as=professional&mode=signup&plan=${encodeURIComponent(p.id)}`,
    );
    return `<article class="${cardClass}${rec}">
${badge}
<h3>${escapeHtml(planName(p.id))}</h3>
<p class="plan-price">${formatPlanPriceAmount(p.monthlyAmount, currency)} <small>${suffix}</small></p>
<ul>
<li><strong>${p.previews}</strong> ${escapeHtml(t("plan.previews"))}</li>
<li>${escapeHtml(t("plan.feature.embed"))}</li>
<li>${escapeHtml(t("plan.feature.popup"))}</li>
<li>${escapeHtml(planDescription(p.id))}</li>
</ul>
<a class="btn${p.recommended ? "" : " ghost"}" href="${href}">${escapeHtml(t("plan.getStarted"))}</a>
</article>`;
  }).join("");
}

function renderPricingFootnote(el) {
  if (!el) return;
  const onHome = el.classList.contains("pricing-foot");
  let html =
    `${escapeHtml(t("pricing.footBefore"))} ` +
    `<a href="mailto:contact@hebelie.com">${escapeHtml(t("pricing.contact"))}</a>.`;
  if (onHome) {
    html +=
      ` ${escapeHtml(t("pricing.footMid"))} ` +
      `<a href="${escapeHtml(localeHref("/pricing.html"))}">${escapeHtml(t("pricing.fullPage"))}</a>.`;
  }
  el.innerHTML = html;
}

export async function initLandingPricing(grid, footnoteEl, opts = {}) {
  await initGeoCountryHint();
  const { currency, suffix } = landingPriceDisplay(peekGeoCountry());
  renderPublicPlanGrid(grid, { currency, suffix, ...opts });
  renderPricingFootnote(footnoteEl);

  const heroLead =
    document.getElementById("homePricingLead") || document.getElementById("pricingPageLead");
  if (heroLead) {
    const pricingPage = Boolean(document.getElementById("pricingPageLead"));
    const leadKey =
      currency === "cad"
        ? pricingPage
          ? "pricingPage.leadCad"
          : "pricing.leadCad"
        : currency === "eur"
          ? pricingPage
            ? "pricingPage.leadEur"
            : "pricing.leadEur"
          : pricingPage
            ? suffix === "/mo"
              ? "pricingPage.leadGeneric"
              : "pricingPage.leadUsd"
            : "pricing.leadUsd";
    heroLead.textContent = t("pricing.trialIntro") + t(leadKey);
  }

  return currency;
}
