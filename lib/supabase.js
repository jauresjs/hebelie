import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { CONFIG } from "../config.js";
import { peekClinicSlug, peekPending } from "./stage-store.js?v=11";

export const ready =
  Boolean(CONFIG.supabaseUrl) && Boolean(CONFIG.supabaseAnonKey);

export const supabase = ready
  ? createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey)
  : null;

export function getSession() {
  if (!supabase) return Promise.resolve(null);
  return supabase.auth.getSession().then(({ data }) => data.session);
}

export function onAuth(cb) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export function redirectTo() {
  const url = new URL(location.origin + location.pathname);
  const fromUrl = new URLSearchParams(location.search).get("clinic");
  const clinic = fromUrl || peekClinicSlug();
  if (clinic) url.searchParams.set("clinic", clinic.trim().toLowerCase());
  if (peekPending()) url.searchParams.set("resume", "1");
  return url.toString();
}
