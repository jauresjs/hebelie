import { applyDocumentI18n, initI18n } from "./i18n.js";
import { initLandingPricing } from "./pricing-display.js";

const page = document.documentElement.dataset.i18nPage || "index";
const force = document.documentElement.dataset.locale;

await initI18n(force === "fr" || force === "en" ? { force } : {});
if (page === "index") applyDocumentI18n("index");

const grid = document.getElementById("homePlanGrid");
const foot = document.querySelector("#pricing .pricing-foot");
void initLandingPricing(grid, foot);
