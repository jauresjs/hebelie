import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { CONFIG } from "../config.js";

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

import { peekPending } from "./stage-store.js";

export function redirectTo() {
  let url = `${location.origin}${location.pathname}`;
  if (peekPending()) url += "#studio";
  return url;
}
