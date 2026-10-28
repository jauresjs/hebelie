export const CONFIG = {
  /** OAuth must return here so IndexedDB matches (www vs apex are different origins). */
  siteUrl: "https://hebelie.com/",
  supabaseUrl: "https://vqetbgdduoyxbszbrxkl.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxZXRiZ2RkdW95eGJzemJyeGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MTQ3NTMsImV4cCI6MjEwODI5MDc1M30.Vg0u2A6JVIT8GePfO8yRQq2f-4vRnaHS06TtLOs9jpM",
  /** Match Supabase STRIPE_SECRET_KEY: pk_test_… for test, pk_live_… for live. */
  stripePublishableKey:
    "pk_live_51TW6O0EUuC3mAVVWPawRonzSHPnLX6Z8SFzH18VYNiWM9Ed7l61v3BzF8fLx7OO0MAmWJipb1RwZz4J1GKu0Cqu100cwX5FxWx",
  /** Optional display; checkout uses Supabase secrets + lookup keys. */
  stripePrices: {
    starter: "price_1UV0AGEUuC3mAVVWPcV8u1DB",
    growth: "price_1UV0AREUuC3mAVVWqO4gR04k",
    pro: "price_1UV0AREUuC3mAVVWEYo4vE5C",
  },
  stripePricesUsd: {
    starter: "price_1UVIpXEUuC3mAVVW7xuN3V9o",
    growth: "price_1UVIpiEUuC3mAVVWC52miSyG",
    pro: "price_1UVIpiEUuC3mAVVW3EUYWVEv",
  },
};
