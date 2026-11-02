import { applyDocumentI18n, initI18n } from "./i18n.js?v=32";

const page = document.documentElement.dataset.i18nPage || "index";

await initI18n();

try {
  const { initLandingPricing } = await import("./pricing-display.js?v=32");
  const grid = document.getElementById("homePlanGrid");
  const foot = document.querySelector("#pricing .pricing-foot");
  await initLandingPricing(grid, foot);
} catch (err) {
  console.error("Hebelie pricing failed to load", err);
}

if (page === "index" || page === "pricing") applyDocumentI18n(page);
