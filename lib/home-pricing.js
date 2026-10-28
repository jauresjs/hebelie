import { applyDocumentI18n, initI18n } from "./i18n.js?v=4";

const page = document.documentElement.dataset.i18nPage || "index";
const force = document.documentElement.dataset.locale;

await initI18n(force === "fr" || force === "en" ? { force } : {});
if (page === "index") applyDocumentI18n("index");

try {
  const { initLandingPricing } = await import("./pricing-display.js?v=6");
  const grid = document.getElementById("homePlanGrid");
  const foot = document.querySelector("#pricing .pricing-foot");
  await initLandingPricing(grid, foot);
} catch (err) {
  console.error("Hebelie pricing failed to load", err);
}
