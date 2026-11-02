export type BillingPlan = "starter" | "growth" | "pro";
export type BillingCurrency = "cad" | "usd" | "eur";

/** One-time embed previews for new clinics (no card). */
export const FREE_TRIAL_PREVIEW_QUOTA = 10;

export const PLAN_QUOTA: Record<BillingPlan, number> = {
  starter: 100,
  growth: 200,
  pro: 300,
};

/** Keep in sync with lib/billing-locale.js EUR_BILLING_COUNTRIES */
const EUR_BILLING_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "CH",
]);

export function billingCurrencyForCountry(countryCode: string | null | undefined): BillingCurrency {
  const c = String(countryCode ?? "").trim().toUpperCase();
  if (c === "CA") return "cad";
  if (EUR_BILLING_COUNTRIES.has(c)) return "eur";
  return "usd";
}

export function lookupKeyForPlan(plan: BillingPlan, currency: BillingCurrency): string {
  return `hebelie_${plan}_monthly_${currency}`;
}

function envPriceId(plan: BillingPlan, currency: BillingCurrency): string | null {
  if (currency === "cad") {
    return Deno.env.get(`STRIPE_PRICE_${plan.toUpperCase()}`) ?? null;
  }
  if (currency === "usd") {
    return Deno.env.get(`STRIPE_PRICE_${plan.toUpperCase()}_USD`) ?? null;
  }
  return Deno.env.get(`STRIPE_PRICE_${plan.toUpperCase()}_EUR`) ?? null;
}

export function planFromPriceId(priceId: string): BillingPlan | null {
  const ids: { plan: BillingPlan; env: string }[] = [
    { plan: "starter", env: "STRIPE_PRICE_STARTER" },
    { plan: "growth", env: "STRIPE_PRICE_GROWTH" },
    { plan: "pro", env: "STRIPE_PRICE_PRO" },
    { plan: "starter", env: "STRIPE_PRICE_STARTER_USD" },
    { plan: "growth", env: "STRIPE_PRICE_GROWTH_USD" },
    { plan: "pro", env: "STRIPE_PRICE_PRO_USD" },
    { plan: "starter", env: "STRIPE_PRICE_STARTER_EUR" },
    { plan: "growth", env: "STRIPE_PRICE_GROWTH_EUR" },
    { plan: "pro", env: "STRIPE_PRICE_PRO_EUR" },
  ];
  for (const { plan, env } of ids) {
    const id = Deno.env.get(env);
    if (id && priceId === id) return plan;
  }
  return null;
}

export function priceIdForPlan(plan: string, currency: BillingCurrency): string | null {
  const p = plan as BillingPlan;
  if (!PLAN_QUOTA[p]) return null;
  return envPriceId(p, currency);
}

/** Env price ID first, then Stripe price lookup_key. */
export async function resolvePriceId(
  stripe: { prices: { list: (p: Record<string, unknown>) => Promise<{ data: { id: string }[] }> } },
  plan: string,
  currency: BillingCurrency,
): Promise<string | null> {
  const fromEnv = priceIdForPlan(plan, currency);
  if (fromEnv) return fromEnv;
  const p = plan as BillingPlan;
  if (!PLAN_QUOTA[p]) return null;
  const listed = await stripe.prices.list({
    lookup_keys: [lookupKeyForPlan(p, currency)],
    active: true,
    limit: 1,
  });
  return listed.data[0]?.id ?? null;
}

export function quotaForPlan(plan: BillingPlan | null): number {
  if (!plan) return 0;
  return PLAN_QUOTA[plan] ?? 0;
}
