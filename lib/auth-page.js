import { CONFIG } from "../config.js";
import {
  clearAuthIntent,
  peekAuthIntent,
  setProIntent,
  setUserIntent,
} from "./auth-intent.js";
import { getSession, onAuth, supabase } from "./supabase.js?v=13";

const $ = (s) => document.querySelector(s);

if (CONFIG.siteUrl) {
  try {
    const home = new URL(CONFIG.siteUrl);
    if (location.hostname !== home.hostname) {
      location.replace(home.origin + location.pathname + location.search);
    }
  } catch {
    /* ignore */
  }
}

function redirectToHere() {
  const url = new URL(location.origin + location.pathname);
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
    $("#authMsg").textContent = "Enter your clinic or practice name.";
    return null;
  }
  return name;
}

async function signInOAuth(provider, role, scopes) {
  $("#authMsg").textContent = "";
  if (role === "pro") {
    const name = proClinicName();
    if (!name) return;
    setProIntent(name);
  } else {
    setUserIntent();
  }
  const options = { redirectTo: redirectToHere() };
  if (scopes) options.scopes = scopes;
  const { error } = await supabase.auth.signInWithOAuth({ provider, options });
  if (error) $("#authMsg").textContent = error.message;
}

async function signInEmail(role) {
  $("#authMsg").textContent = "";
  const email =
    role === "pro"
      ? $("#proEmailInput").value.trim()
      : $("#userEmailInput").value.trim();
  if (role === "pro") {
    const name = proClinicName();
    if (!name) return;
    setProIntent(name);
  } else {
    setUserIntent();
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectToHere() },
  });
  $("#authMsg").textContent = error ? error.message : "Check your email for a sign-in link.";
}

$("#userGoogle").onclick = () => signInOAuth("google", "user");
$("#userFacebook").onclick = () => signInOAuth("facebook", "user", "email");
$("#userEmail").onsubmit = (e) => {
  e.preventDefault();
  signInEmail("user");
};

$("#proGoogle").onclick = () => signInOAuth("google", "pro");
$("#proFacebook").onclick = () => signInOAuth("facebook", "pro", "email");
$("#proEmail").onsubmit = (e) => {
  e.preventDefault();
  signInEmail("pro");
};

async function finishAfterLogin(session) {
  if (!session) return;
  const intent = peekAuthIntent();
  if (!intent) {
    location.href = "./index.html#studio-start";
    return;
  }

  if (intent.role === "user") {
    clearAuthIntent();
    location.href = "./index.html#studio-start";
    return;
  }

  if (intent.role === "pro" && intent.clinicName) {
    const { data, error } = await supabase.functions.invoke("provision-clinic", {
      body: { clinic_name: intent.clinicName, lead_email: session.user.email },
    });
    clearAuthIntent();
    if (error || data?.error) {
      $("#authMsg").textContent =
        data?.error === "email_required"
          ? "We need an email on your account to create your clinic."
          : "Could not create your clinic. Try again or contact support.";
      return;
    }
    location.href = "./dashboard.html";
    return;
  }

  clearAuthIntent();
  location.href = "./dashboard.html";
}

async function onReturn() {
  const resume =
    new URLSearchParams(location.search).has("resume") ||
    /access_token|refresh_token/.test(location.hash);
  if (resume) {
    const u = new URL(location.href);
    u.searchParams.delete("resume");
    u.hash = "";
    history.replaceState(null, "", u.pathname + u.search);
  }
  const session = await getSession();
  if (session && (resume || peekAuthIntent())) {
    await finishAfterLogin(session);
  }
}

onAuth(async (session) => {
  if (session && peekAuthIntent()) await finishAfterLogin(session);
});

onReturn();
