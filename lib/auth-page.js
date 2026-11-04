import { CONFIG } from "../config.js";
import { applyDocumentI18n, initI18n, t } from "./i18n.js?v=31";

await initI18n();
applyDocumentI18n("auth");
import {
  clearAuthIntent,
  peekAuthIntent,
  setProIntent,
  setProSignInIntent,
  setUserIntent,
} from "./auth-intent.js";
import {
  normalizeBillingCountry,
  regionsForCountry,
  requiresRegionDropdown,
  SIGNUP_COUNTRIES,
} from "./billing-locale.js";
import { initGeoCountryHint, peekGeoCountry } from "./geo-hint.js";
import { ensureClinicForSession, resolveLoginContext } from "./clinic-provision.js";
import { getSession, onAuth, supabase, waitForSession } from "./supabase.js?v=19";

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

function queryIndicatesClinic() {
  const as = (initialSearch.get("as") || "").toLowerCase();
  if (as === "professional" || as === "pro" || as === "clinic") return true;
  const mode = initialSearch.get("mode");
  if (mode === "signup") return true;
  if (mode === "signin" && as) return true;
  if (initialSearch.has("plan")) return true;
  return false;
}

const initialAsProfessional = queryIndicatesClinic();
const initialMode = initialSearch.get("mode");
/** @type {boolean} */
let proSignInMode =
  initialMode === "signin" ? true : initialMode === "signup" ? false : false;
const emailLinkReturn = (() => {
  return (
    initialSearch.has("resume") ||
    initialSearch.has("code") ||
    initialSearch.has("token_hash") ||
    initialSearch.get("type") === "magiclink" ||
    initialSearch.get("type") === "signup" ||
    /access_token|refresh_token/.test(location.hash)
  );
})();

/** Query params at first paint (before stripAuthParamsFromUrl). */
const frozenPlan = initialSearch.get("plan");
const frozenAsProfessional = initialAsProfessional;

function authPageUrl() {
  const base = CONFIG.siteUrl || location.origin;
  return new URL("/auth.html", base);
}

function dashboardReturnUrl() {
  const url = new URL("/dashboard.html", CONFIG.siteUrl || location.origin);
  url.searchParams.set("from_auth", "1");
  url.searchParams.set("resume", "1");
  if (frozenPlan) url.searchParams.set("plan", frozenPlan);
  return url.href;
}

function emailRedirectTo(role) {
  if (role === "pro" && !proSignInMode) {
    return dashboardReturnUrl();
  }
  const url = authPageUrl();
  url.searchParams.set("resume", "1");
  if (role === "pro") {
    url.searchParams.set("as", "professional");
    url.searchParams.set("mode", "signin");
  }
  return url.href;
}

function redirectToHere() {
  const url = new URL(location.href);
  if (new URLSearchParams(location.search).get("resume") || peekAuthIntent()) {
    url.searchParams.set("resume", "1");
  }
  const as = new URLSearchParams(location.search).get("as");
  if (as) url.searchParams.set("as", as);
  if (proSignInMode) url.searchParams.set("mode", "signin");
  else url.searchParams.set("mode", "signup");
  return url.toString();
}

function syncProModeInUrl() {
  const u = new URL(location.href);
  if (u.searchParams.get("as") !== "professional") return;
  u.searchParams.set("mode", proSignInMode ? "signin" : "signup");
  history.replaceState(null, "", u.pathname + u.search);
}

function isClinicContext() {
  if (initialAsProfessional) return true;
  return $("#tabPro")?.getAttribute("aria-selected") === "true";
}

function syncClinicQueryInUrl() {
  if (!initialAsProfessional) return;
  const u = new URL(location.href);
  u.searchParams.set("as", "professional");
  if (!u.searchParams.get("mode")) {
    u.searchParams.set("mode", proSignInMode ? "signin" : "signup");
  }
  history.replaceState(null, "", u.pathname + u.search);
}

function setProSignInMode(signIn) {
  proSignInMode = signIn;
  const signInPanel = $("#proSignInPanel");
  const signUpPanel = $("#proSignUpPanel");
  if (signInPanel) signInPanel.hidden = !signIn;
  if (signUpPanel) signUpPanel.hidden = signIn;

  const clinicUi = isClinicContext();
  const pageTitle = $("#authPageTitle");
  const pageLead = $("#authPageLead");
  if (pageTitle) pageTitle.hidden = clinicUi;
  if (pageLead) pageLead.hidden = clinicUi;
  if ($("#clinicSignInTitle")) $("#clinicSignInTitle").hidden = !clinicUi || !signIn;
  if ($("#clinicSignUpTitle")) $("#clinicSignUpTitle").hidden = !clinicUi || signIn;
  if ($("#clinicSignInLead")) $("#clinicSignInLead").hidden = !clinicUi || !signIn;
  if ($("#clinicSignUpLead")) $("#clinicSignUpLead").hidden = !clinicUi || signIn;

  if ($("#proSwitchSignUp")) $("#proSwitchSignUp").hidden = !signIn;
  if ($("#proSwitchSignIn")) $("#proSwitchSignIn").hidden = signIn;

  syncProModeInUrl();
}

function selectTab(pro) {
  $("#tabUser").setAttribute("aria-selected", pro ? "false" : "true");
  $("#tabPro").setAttribute("aria-selected", pro ? "true" : "false");
  $("#panelUser").hidden = pro;
  $("#panelPro").hidden = !pro;
  if (pro) setProSignInMode(proSignInMode);
  else {
    $("#authPageTitle").hidden = false;
    $("#authPageLead").hidden = false;
    $("#clinicSignInTitle").hidden = true;
    $("#clinicSignUpTitle").hidden = true;
    $("#clinicSignInLead").hidden = true;
    $("#clinicSignUpLead").hidden = true;
  }
}

function initAuthLayout() {
  if (initialAsProfessional) {
    document.body.classList.add("auth-clinic");
    const segment = $("#patientChoice");
    if (segment) segment.hidden = true;
    $("#panelUser").hidden = true;
    $("#panelPro").hidden = false;
    selectTab(true);
    setProSignInMode(proSignInMode);
    return;
  }
  const segment = $("#patientChoice");
  if (segment) segment.hidden = false;
  selectTab(true);
  if (initialMode !== "signin") setProSignInMode(false);
}

$("#tabUser")?.addEventListener("click", () => selectTab(false));
$("#tabPro")?.addEventListener("click", () => {
  selectTab(true);
  if (!initialMode) setProSignInMode(false);
});

initAuthLayout();
syncClinicQueryInUrl();

$("#proGoSignUp")?.addEventListener("click", () => setProSignInMode(false));
$("#proGoSignIn")?.addEventListener("click", () => setProSignInMode(true));

function countryOptionLabel(code) {
  return t(`auth.country.${code}`) || SIGNUP_COUNTRIES.find((c) => c.code === code)?.name || code;
}

function populateCountrySelect() {
  const sel = $("#billingCountry");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = SIGNUP_COUNTRIES.map(
    (c) => `<option value="${c.code}">${countryOptionLabel(c.code)}</option>`,
  ).join("");
  if (prev) sel.value = prev;
}

function syncRegionFields() {
  const countryEl = $("#billingCountry");
  const regionGroup = $("#billingRegionGroup");
  const regionSel = $("#billingRegion");
  const label = $("#billingRegionLabel");
  const hint = $("#regionHint");
  if (!countryEl || !regionSel || !label) return;

  const country = countryEl.value;
  const regions = regionsForCountry(country);

  if (requiresRegionDropdown(country) && regions) {
    if (regionGroup) regionGroup.hidden = false;
    label.textContent =
      country === "CA" ? t("auth.regionLabel.ca") : t("auth.regionLabel.us");
    regionSel.hidden = false;
    regionSel.required = true;
    regionSel.innerHTML =
      `<option value="">${t("auth.selectOption")}</option>` +
      regions.map(([code, name]) => `<option value="${code}">${name}</option>`).join("");
    if (hint) hint.textContent = t("auth.regionHint.requiredShort");
  } else {
    if (regionGroup) regionGroup.hidden = true;
    regionSel.required = false;
    regionSel.value = "";
    regionSel.innerHTML = "";
  }
}

function readProSignup() {
  const name = $("#clinicName").value.trim();
  if (name.length < 2) {
    setAuthMsg(t("auth.err.clinicName"), false);
    return null;
  }

  const countryRaw = $("#billingCountry").value;
  const billing_country = normalizeBillingCountry(countryRaw);

  let billing_region = "";
  if (requiresRegionDropdown(countryRaw)) {
    billing_region = $("#billingRegion").value.trim();
    if (!billing_region) {
      const regionLabel =
        countryRaw === "CA" ? t("auth.regionLabel.ca") : t("auth.regionLabel.us");
      setAuthMsg(t("auth.err.selectRegion", { region: regionLabel.toLowerCase() }), false);
      return null;
    }
  }

  return {
    clinicName: name,
    billingCountry: billing_country,
    billingRegion: billing_region,
  };
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
    if (proSignInMode) {
      setProSignInIntent();
    } else {
      const pro = readProSignup();
      if (!pro) return;
      setProIntent(pro);
    }
  } else {
    setUserIntent();
  }
  /** @type {import("@supabase/supabase-js").SignInWithOAuthCredentials["options"]} */
  const options = { redirectTo: redirectToHere() };
  if (role === "pro") {
    const pro = peekAuthIntent();
    if (proSignInMode || !pro?.clinicName) {
      options.data = { hebelie_role: "pro" };
    } else if (pro?.clinicName) {
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
  $("#proGoogleSignUp")?.setAttribute("disabled", "true");
  $("#proSignUpForm")?.querySelectorAll("input").forEach((el) => {
    el.readOnly = true;
  });
}

function ackEmailSent(role) {
  const form = role === "pro" ? $("#proSignUpForm") : $("#userEmail");
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
  const proExtra =
    role === "pro"
      ? " Then log in with the password you just set."
      : "";
  setAuthMsg(
    "<strong>Request received.</strong> We sent a confirmation email to that address. " +
      `Open the link in that message to finish signing in—${afterLink}${proExtra} ` +
      "If the link opens a new tab, you can close it and stay on this page—we’ll take you there when sign-in completes.",
    true,
  );
}

async function signInProPassword() {
  setAuthMsg("", false);
  const email = $("#proSignInEmailInput").value.trim();
  const password = $("#proPasswordInput")?.value ?? "";
  if (!email) return;
  if (!password) {
    setAuthMsg(t("auth.err.passwordRequired"), false);
    return;
  }
  setProSignInIntent();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = /invalid login credentials/i.test(error.message)
      ? t("auth.err.invalidCredentials")
      : error.message;
    setAuthMsg(msg, false);
    return;
  }
  if (data.session) await maybeFinishLogin(data.session);
}

async function requestProPasswordReset() {
  setAuthMsg("", false);
  const email = $("#proSignInEmailInput").value.trim();
  if (!email) {
    setAuthMsg(t("auth.workEmail") + " — required.", false);
    return;
  }
  const url = authPageUrl();
  url.searchParams.set("as", "professional");
  url.searchParams.set("mode", "signin");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: url.href,
  });
  if (error) {
    setAuthMsg(error.message, false);
    return;
  }
  setAuthMsg(t("auth.resetSent"), true);
}

async function signUpProEmail() {
  setAuthMsg("", false);
  setProSignInMode(false);
  const pro = readProSignup();
  if (!pro) return;

  const email = $("#proSignUpEmailInput").value.trim();
  const password = $("#proSignUpPasswordInput")?.value ?? "";
  const confirm = $("#proSignUpPasswordConfirmInput")?.value ?? "";
  if (password.length < 8) {
    setAuthMsg(t("auth.err.passwordShort"), false);
    return;
  }
  if (password !== confirm) {
    setAuthMsg(t("auth.err.passwordMismatch"), false);
    return;
  }

  setProIntent(pro);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: emailRedirectTo("pro"),
      data: {
        hebelie_role: "pro",
        clinic_name: pro.clinicName,
        billing_country: pro.billingCountry,
        billing_region: pro.billingRegion || "",
      },
    },
  });
  if (error) {
    setAuthMsg(authEmailErrorMessage(error.message), false);
    return;
  }
  if (data.session) {
    await maybeFinishLogin(data.session);
    return;
  }
  ackEmailSent("pro");
}

async function signInEmail(role) {
  setAuthMsg("", false);
  const email = $("#userEmailInput").value.trim();
  setUserIntent();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: emailRedirectTo("user"),
      data: { hebelie_role: "user" },
    },
  });
  if (error) {
    setAuthMsg(authEmailErrorMessage(error.message), false);
    return;
  }
  ackEmailSent("user");
}

function authEmailErrorMessage(message) {
  if (/error sending confirmation email/i.test(message)) {
    return (
      "We couldn’t send the sign-in email (Auth SMTP). Try <strong>Continue with Google</strong>, " +
      "or ask your admin to fix Supabase → Authentication → SMTP (use a verified @hebelie.com sender, not onboarding@resend.dev). " +
      "See _docs/SMTP_SETUP.md in the repo."
    );
  }
  return message;
}

$("#userGoogle").onclick = () => signInOAuth("google", "user");
$("#userEmail").onsubmit = (e) => {
  e.preventDefault();
  signInEmail("user");
};

$("#proGoogle").onclick = () => {
  setProSignInMode(true);
  void signInOAuth("google", "pro");
};
$("#proGoogleSignUp")?.addEventListener("click", () => {
  setProSignInMode(false);
  void signInOAuth("google", "pro");
});
$("#proForgotPassword")?.addEventListener("click", () => {
  void requestProPasswordReset();
});
$("#proSignInForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  setProSignInMode(true);
  void signInProPassword();
});
$("#proSignUpForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  void signUpProEmail();
});

function dashboardHref() {
  try {
    return new URL("/dashboard.html", CONFIG.siteUrl || location.origin).pathname;
  } catch {
    return "/dashboard.html";
  }
}

async function finishAfterLogin(session) {
  if (!session) return;

  const ctx = resolveLoginContext(session, { frozenAsProfessional });
  clearAuthIntent();
  stripAuthParamsFromUrl();

  if (ctx.role === "user") {
    location.href = "./index.html#studio-start";
    return;
  }

  const provision = await ensureClinicForSession(session, ctx);
  if (!provision.ok) {
    postLoginHandled = false;
    setAuthMsg(
      provision.error === "email_required"
        ? "We need an email on your account to create your clinic."
        : "Could not create your clinic. Try again or contact support.",
      false,
    );
    return;
  }

  const dash = new URL(dashboardHref(), location.origin);
  dash.searchParams.set("from_auth", "1");
  if (frozenPlan) dash.searchParams.set("plan", frozenPlan);
  location.href = dash.pathname + dash.search;
}

let postLoginHandled = false;

/** True in the tab that opened the email link (no sessionStorage intent from signup). */
function shouldFinishAfterAuth(session) {
  if (!session) return false;
  if (emailLinkReturn || frozenAsProfessional || peekAuthIntent()) return true;
  const meta = session.user?.user_metadata ?? {};
  if (meta.hebelie_role === "pro" || meta.clinic_name) return true;
  if (meta.hebelie_role === "user") return true;
  return false;
}

async function absorbEmailLinkTokens() {
  if (!supabase) return;
  const tokenHash = initialSearch.get("token_hash");
  const type = initialSearch.get("type");
  if (!tokenHash || !type) return;
  const allowed = new Set(["signup", "email", "magiclink", "invite", "recovery"]);
  if (!allowed.has(type)) return;
  await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: /** @type {import("@supabase/supabase-js").EmailOtpType} */ (type),
  });
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
  await absorbEmailLinkTokens();
  let session = await waitForSession(25000);
  if (!session) session = await getSession();
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
  if (!emailLinkReturn && !frozenAsProfessional) return;
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
