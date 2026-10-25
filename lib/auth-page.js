import { CONFIG } from "../config.js";
import {
  clearAuthIntent,
  peekAuthIntent,
  setProIntent,
  setUserIntent,
} from "./auth-intent.js";
import { getSession, onAuth, supabase, waitForSession } from "./supabase.js?v=15";

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
const emailLinkReturn = (() => {
  const q = new URLSearchParams(location.search);
  return (
    q.has("resume") ||
    q.has("code") ||
    q.has("token_hash") ||
    /access_token|refresh_token/.test(location.hash)
  );
})();

function authPageUrl() {
  if (CONFIG.siteUrl) return new URL("auth.html", CONFIG.siteUrl);
  return new URL("/auth.html", location.origin);
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

function proClinicName() {
  const name = $("#clinicName").value.trim();
  if (name.length < 2) {
    setAuthMsg("Enter your clinic or practice name.", false);
    return null;
  }
  return name;
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
    const name = proClinicName();
    if (!name) return;
    setProIntent(name);
  } else {
    setUserIntent();
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: redirectToHere() },
  });
  if (error) setAuthMsg(error.message, false);
}

function ackEmailSent(role) {
  const form = role === "pro" ? $("#proEmail") : $("#userEmail");
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  form.querySelectorAll("input").forEach((el) => {
    el.readOnly = true;
  });
  if (role === "pro") {
    $("#clinicName").readOnly = true;
    $("#proGoogle").disabled = true;
  } else {
    $("#userGoogle").disabled = true;
  }

  const afterLink =
    role === "pro"
      ? "your dashboard will open."
      : "you can continue in the studio.";
  setAuthMsg(
    "<strong>Request received.</strong> We sent a confirmation email to that address. " +
      `Open the link in that message to finish signing in—${afterLink}`,
    true
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
    const name = proClinicName();
    if (!name) return;
    setProIntent(name);
    data.clinic_name = name;
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
    setAuthMsg(error.message, false);
    return;
  }
  ackEmailSent(role);
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
    asParam === "professional";

  if (isPro) {
    return {
      role: "pro",
      clinicName: intent?.clinicName || meta.clinic_name || "",
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
      body: { clinic_name: ctx.clinicName, lead_email: session.user.email },
    });
    if (error || data?.error) {
      setAuthMsg(
        data?.error === "email_required"
          ? "We need an email on your account to create your clinic."
          : "Could not create your clinic. Try again or contact support.",
        false
      );
      return;
    }
  }

  location.href = "./dashboard.html";
}

let postLoginHandled = false;

async function completeReturnFromEmail() {
  if (!emailLinkReturn || postLoginHandled) return;
  postLoginHandled = true;

  setAuthMsg("Completing sign-in…", false);
  const session = await waitForSession();
  if (!session) {
    postLoginHandled = false;
    setAuthMsg(
      "We could not verify that sign-in link. It may have expired—submit your email again for a new link.",
      false
    );
    stripAuthParamsFromUrl();
    return;
  }

  await finishAfterLogin(session);
}

onAuth((session) => {
  if (!session || postLoginHandled) return;
  if (peekAuthIntent()) {
    postLoginHandled = true;
    void finishAfterLogin(session);
  }
});

completeReturnFromEmail();
