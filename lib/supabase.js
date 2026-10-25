import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { CONFIG } from "../config.js";
import { peekClinicSlug, peekPending } from "./stage-store.js?v=13";

export const ready =
  Boolean(CONFIG.supabaseUrl) && Boolean(CONFIG.supabaseAnonKey);

export const supabase = ready
  ? createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        flowType: "pkce",
      },
    })
  : null;

export function getSession() {
  if (!supabase) return Promise.resolve(null);
  return supabase.auth.getSession().then(({ data }) => data.session);
}

/** Wait for magic-link / OAuth tokens in the URL to become a session. */
export function waitForSession(timeoutMs = 15000) {
  return getSession().then((session) => {
    if (session || !supabase) return session;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      const { data } = supabase.auth.onAuthStateChange((event, s) => {
        if (s && (event === "INITIAL_SESSION" || event === "SIGNED_IN")) {
          clearTimeout(timer);
          data.subscription.unsubscribe();
          resolve(s);
        }
      });
    });
  });
}

export function onAuth(cb) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export function redirectTo() {
  const url = new URL(location.href);
  url.hash = "";
  url.searchParams.delete("resume");
  const fromUrl = new URLSearchParams(location.search).get("clinic");
  const clinic = fromUrl || peekClinicSlug();
  if (clinic && !url.pathname.match(/\/c\/[^/]+\/?$/i)) {
    url.searchParams.set("clinic", clinic.trim().toLowerCase());
  }
  if (peekPending()) url.searchParams.set("resume", "1");
  return url.origin + url.pathname + url.search;
}
