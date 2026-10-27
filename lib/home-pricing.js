import { BILLING_PLANS } from "./billing-plans.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const grid = document.getElementById("homePlanGrid");
if (grid) {
  grid.innerHTML = BILLING_PLANS.map((p) => {
    const rec = p.recommended ? " rec" : "";
    const badge = p.recommended ? '<span class="plan-badge">Recommended</span>' : "";
    const href = `./auth.html?as=professional&plan=${encodeURIComponent(p.id)}`;
    return `<article class="plan-card${rec}">
${badge}
<h3>${escapeHtml(p.name)}</h3>
<p class="plan-price">$${p.priceCad} <small>CAD / month</small></p>
<ul>
<li><strong>${p.previews}</strong> previews per month</li>
<li>Website embed &amp; leads dashboard</li>
<li>${escapeHtml(p.description)}</li>
</ul>
<a class="btn${p.recommended ? "" : " ghost"}" href="${href}">Get started</a>
</article>`;
  }).join("");
}
