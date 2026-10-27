/** Copy to config.js — use Project Settings → API → anon / publishable key only */
export const CONFIG = {
  siteUrl: "https://hebelie.com/",
  supabaseUrl: "https://vqetbgdduoyxbszbrxkl.supabase.co",
  supabaseAnonKey: "YOUR_ANON_KEY",
  /** Optional — checkout resolves Stripe lookup keys if omitted. */
  stripePrices: {
    starter: "",
    growth: "",
    pro: "",
  },
};
