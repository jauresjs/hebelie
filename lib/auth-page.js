import { CONFIG } from "../config.js";
import { applyDocumentI18n, initI18n, localePath, t } from "./i18n.js?v=3";

const forceLocale = document.documentElement.dataset.locale;
await initI18n(forceLocale === "fr" || forceLocale === "en" ? { force: forceLocale } : {});
applyDocumentI18n("auth");
import {
  clearAuthIntent,
  peekAuthIntent,
  setProIntent,
  setUserIntent,
} from "./auth-intent.js";
import {
  normalizeBillingCountry,
  regionsForCountry,
  regionLabelForCountry,
  requiresRegionDropdown,
  SIGNUP_COUNTRIES,
} from "./billing-locale.js";
import { initGeoCountryHint, peekGeoCountry } from "./geo-hint.js";
import { getSession, onAuth, supabase, waitForSession } from "./supabase.js?v=17";

const $ = (s) => document.querySelector(s);

if (CONFIG.siteUrl) {
  try {
    const home = new URL(CONFIG.siteUrl);
    if (location.hostname !== home.hostname) {
      location.replace(home.origin + location.pathname + location.search + location.hash);
    }
  } catch {
    /* ignore */
  }
}

/** Captured on first load — do not rely on URL after Supabase consumes tokens. */
const initialSearch = new URLSearchParams(location.search);
const initialAsProfessional = initialSearch.get("as") === "professional";
const emailLinkReturn = (() => {
  return (
    initialSearch.has("resume") ||
    initialSearch.has("code") ||
    initialSearch.has("token_hash") ||
    /access_token|refresh_token/.test(location.hash)
  );
})();

function authPageUrl() {
  const path = localePath("/auth.html");
  if (CONFIG.siteUrl) return new URL(path, CONFIG.siteUrl);
  return new URL(path, location.origin);
}

function emailRedirectTo(role) {
  const url = authPageUrl();
  url.searchParams.set("resume", "1");
  if (role === "pro") url.searchParams.set("as", "professional");
  return url.href;
}

function redirectToHere() {
  const url = new URL(location.href);
  if (new URLSearchParams(location.search).get("resume") || peekAuthIntent()) {
    url.searchParams.set("resume", "1");
  }
  const as = new URLSearchParams(location.search).get("as");
  if (as) url.searchParams.set("as", as);
  return url.toString();
}

function selectTab(pro) {
  $("#tabUser").setAttribute("aria-selected", pro ? "false" : "true");
  $("#tabPro").setAttribute("aria-selected", pro ? "true" : "false");
  $("#panelUser").hidden = pro;
  $("#panelPro").hidden = !pro;
}

$("#tabUser").onclick = () => selectTab(false);
$("#tabPro").onclick = () => selectTab(true);

if (new URLSearchParams(location.search).get("as") === "professional") {
  selectTab(true);
}

function populateCountrySelect() {
  const sel = $("#billingCountry");
  if (!sel) return;
  sel.innerHTML = SIGNUP_COUNTRIES.map(
    (c) => `<option value="${c.code}">${c.name}</option>`,
  ).join("");
}

function syncRegionFields() {
  const countryEl = $("#billingCountry");
  const regionSel = $("#billingRegion");
  const regionText = $("#billingRegionText");
  const label = $("#billingRegionLabel");
  const hint = $("#regionHint");
  if (!countryEl || !regionSel || !regionText || !label) return;

  const country = countryEl.value;
  label.textContent =
    country === "CA"
      ? t("auth.regionLabel.ca")
      : country === "US"
        ? t("auth.regionLabel.us")
        : t("auth.regionLabel.other");
  const regions = regionsForCountry(country);

  if (requiresRegionDropdown(country) && regions) {
    regionSel.hidden = false;
    regionSel.required = true;
    regionText.hidden = true;
    regionText.required = false;
    regionText.value = "";
    regionSel.innerHTML =
      `<option value="">Select…</option>` +
      regions.map(([code, name]) => `<option value="${code}">${name}</option>`).join("");
    if (hint) hint.textContent = t("auth.regionHint.requiredShort");
  } else {
    regionSel.hidden = true;
    regionSel.required = false;
    regionSel.innerHTML = "";
    regionText.hidden = false;
    regionText.required = country !== "OTHER";
    if (hint) {
      hint.textContent =
        country === "OTHER" ? t("auth.regionHint.otherRequired") : t("auth.regionHint.other");
    }
  }
}

function readProSignup() {
  const name = $("#clinicName").value.trim();
  if (name.length < 2) {
    setAuthMsg("Enter your clinic or practice name.", false);
    return null;
  }

  const countryRaw = $("#billingCountry").value;
  const billing_country = normalizeBillingCountry(countryRaw);

  let billing_region = "";
  if (requiresRegionDropdown(countryRaw)) {
    billing_region = $("#billingRegion").value.trim();
    if (!billing_region) {
      setAuthMsg(`Select your ${regionLabelForCountry(countryRaw).toLowerCase()}.`, false);
      return null;
    }
  } else {
    billing_region = $("#billingRegionText").value.trim();
    if (countryRaw === "OTHER" && billing_region.length < 2) {
      setAuthMsg("Enter your state, province, or region.", false);
      return null;
    }
  }

  return { clinicName: name, billing_country, billing_region };
}

function setAuthMsg(html, success) {
  const el = $("#authMsg");
  el.classList.toggle("msg--success", Boolean(success));
  el.innerHTML = html;
}

function stripAuthParamsFromUrl() {
  const u = new URL(location.href);
  u.searchParams.delete("resume");
  u.searchParams.delete("code");
  u.searchParams.delete("token_hash");
  u.hash = "";
  history.replaceState(null, "", u.pathname + u.search);
}

async function signInOAuth(provider, role) {
  setAuthMsg("", false);
  if (role === "pro") {
    const pro = readProSignup();
    if (!pro) return;
    setProIntent(pro);
  } else {
    setUserIntent();
  }
  /** @type {import("@supabase/supabase-js").SignInWithOAuthCredentials["options"]} */
  const options = { redirectTo: redirectToHere() };
  if (role === "pro") {
    const pro = peekAuthIntent();
    if (pro?.clinicName) {
      options.data = {
        hebelie_role: "pro",
        clinic_name: pro.clinicName,
        billing_country: pro.billingCountry,
        billing_region: pro.billingRegion || "",
      };
    }
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options,
  });
  if (error) setAuthMsg(error.message, false);
}

function lockProFields() {
  $("#clinicName").readOnly = true;
  $("#billingCountry").disabled = true;
  $("#billingRegion").disabled = true;
  $("#billingRegionText").readOnly = true;
  $("#proGoogle").disabled = true;
}

function ackEmailSent(role) {
  const form = role === "pro" ? $("#proEmail") : $("#userEmail");
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  form.querySelectorAll("input").forEach((el) => {
    el.readOnly = true;
  });
  if (role === "pro") lockProFields();
  else $("#userGoogle").disabled = true;

  const afterLink =
    role === "pro"
      ? "your dashboard will open."
      : "you can continue in the studio.";
  setAuthMsg(
    "<strong>Request received.</strong> We sent a confirmation email to that address. " +
      `Open the link in that message to finish signing in—${afterLink} ` +
      "If the link opens a new tab, you can close it and stay on this page—we’ll take you there when sign-in completes.",
    true,
  );
}

async function signInEmail(role) {
  setAuthMsg("", false);
  const email =
    role === "pro"
      ? $("#proEmailInput").value.trim()
      : $("#userEmailInput").value.trim();

  /** @type {Record<string, string>} */
  const data = { hebelie_role: role === "pro" ? "pro" : "user" };

  if (role === "pro") {
    const pro = readProSignup();
    if (!pro) return;
    setProIntent(pro);
    data.clinic_name = pro.clinicName;
    data.billing_country = pro.billing_country;
    if (pro.billing_region) data.billing_region = pro.billing_region;
  } else {
    setUserIntent();
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: emailRedirectTo(role),
      data,
    },
  });
  if (error) {
    setAuthMsg(authEmailErrorMessage(error.message), false);
    return;
  }
  ackEmailSent(role);
}

function authEmailErrorMessage(message) {
  if (/error sending confirmation email/i.test(message)) {
    return (
      "We couldn’t send the sign-in email (Auth SMTP). Try <strong>Continue with Google</strong>, " +
      "or ask your admin to fix Supabase → Authentication → SMTP (use a verified @hebelie.com sender, not onboarding@resend.dev). " +
      "See SMTP_SETUP.md in the repo."
    );
  }
  return message;
}

$("#userGoogle").onclick = () => signInOAuth("google", "user");
$("#userEmail").onsubmit = (e) => {
  e.preventDefault();
  signInEmail("user");
};

$("#proGoogle").onclick = () => signInOAuth("google", "pro");
$("#proEmail").onsubmit = (e) => {
  e.preventDefault();
  signInEmail("pro");
};

function resolveLoginContext(session) {
  const intent = peekAuthIntent();
  const meta = session.user?.user_metadata ?? {};
  const asParam = new URLSearchParams(location.search).get("as");
  const isPro =
    intent?.role === "pro" ||
    meta.hebelie_role === "pro" ||
    asParam === "professional" ||
    initialAsProfessional;

  if (isPro) {
    return {
      role: "pro",
      clinicName: intent?.clinicName || meta.clinic_name || "",
      billingCountry: intent?.billingCountry || meta.billing_country || "CA",
      billingRegion: intent?.billingRegion || meta.billing_region || "",
    };
  }
  if (intent?.role === "user" || meta.hebelie_role === "user") {
    return { role: "user" };
  }
  return { role: "user" };
}

async function finishAfterLogin(session) {
  if (!session) return;

  const ctx = resolveLoginContext(session);
  clearAuthIntent();
  stripAuthParamsFromUrl();

  if (ctx.role === "user") {
    location.href = "./index.html#studio-start";
    return;
  }

  if (ctx.clinicName) {
    const { data, error } = await supabase.functions.invoke("provision-clinic", {
      body: {
        clinic_name: ctx.clinicName,
        lead_email: session.user.email,
        billing_country: ctx.billingCountry,
        billing_region: ctx.billingRegion || null,
      },
    });
    if (error || data?.error) {
      setAuthMsg(
        data?.error === "email_required"
          ? "We need an email on your account to create your clinic."
          : "Could not create your clinic. Try again or contact support.",
        false,
      );
      return;
    }
  }

  const dash = new URL("./dashboard.html", location.href);
  dash.searchParams.set("from_auth", "1");
  const plan = new URLSearchParams(location.search).get("plan");
  if (plan) dash.searchParams.set("plan", plan);
  location.href = dash.pathname + dash.search;
}

let postLoginHandled = false;

/** True in the tab that opened the email link (no sessionStorage intent from signup). */
function shouldFinishAfterAuth(session) {
  if (!session) return false;
  if (peekAuthIntent()) return true;
  if (emailLinkReturn) return true;
  if (initialAsProfessional) return true;
  const role = session.user?.user_metadata?.hebelie_role;
  return role === "pro" || role === "user";
}

async function maybeFinishLogin(session) {
  if (!session || postLoginHandled || !shouldFinishAfterAuth(session)) return;
  postLoginHandled = true;
  await finishAfterLogin(session);
}

onAuth((session) => {
  void maybeFinishLogin(session);
});

async function completeReturnFromEmail() {
  if (!emailLinkReturn || postLoginHandled) return;

  setAuthMsg("Completing sign-in…", false);
  const session = await waitForSession(20000);
  if (session) {
    await maybeFinishLogin(session);
  }
  if (!postLoginHandled) {
    setAuthMsg(
      "We could not verify that sign-in link. It may have expired—submit your email again for a new link.",
      false,
    );
    stripAuthParamsFromUrl();
  }
}

completeReturnFromEmail();

/** Session may already exist (e.g. link opened in another tab, storage synced). */
async function finishIfSessionAlreadyPresent() {
  if (postLoginHandled) return;
  if (!emailLinkReturn && !initialAsProfessional) return;
  const session = await getSession();
  await maybeFinishLogin(session);
}

finishIfSessionAlreadyPresent();

async function initProLocationFields() {
  populateCountrySelect();
  $("#billingCountry")?.addEventListener("change", syncRegionFields);
  syncRegionFields();

  const geo = await initGeoCountryHint();
  const prefill = geo || peekGeoCountry();
  if (prefill && $("#billingCountry")) {
    const sel = $("#billingCountry");
    const known = [...sel.options].some((o) => o.value === prefill);
    sel.value = known ? prefill : "OTHER";
    syncRegionFields();
  }
}

void initProLocationFields();
