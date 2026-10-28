export type BillingPlan = "starter" | "growth" | "pro";
export type BillingCurrency = "cad" | "usd";

export const PLAN_QUOTA: Record<BillingPlan, number> = {
  starter: 100,
  growth: 200,
  pro: 300,
};

export function billingCurrencyForCountry(countryCode: string | null | undefined): BillingCurrency {
  const c = String(countryCode ?? "").trim().toUpperCase();
  return c === "CA" ? "cad" : "usd";
}

export function lookupKeyForPlan(plan: BillingPlan, currency: BillingCurrency): string {
  return `hebelie_${plan}_monthly_${currency}`;
}

function envPriceId(plan: BillingPlan, currency: BillingCurrency): string | null {
  const suffix = currency === "usd" ? "_USD" : "";
  const key = `STRIPE_PRICE_${plan.toUpperCase()}${suffix}`;
  return Deno.env.get(key) ?? (currency === "cad" ? Deno.env.get(`STRIPE_PRICE_${plan.toUpperCase()}`) : null);
}

export function planFromPriceId(priceId: string): BillingPlan | null {
  const ids: { plan: BillingPlan; env: string }[] = [
    { plan: "starter", env: "STRIPE_PRICE_STARTER" },
    { plan: "growth", env: "STRIPE_PRICE_GROWTH" },
    { plan: "pro", env: "STRIPE_PRICE_PRO" },
    { plan: "starter", env: "STRIPE_PRICE_STARTER_USD" },
    { plan: "growth", env: "STRIPE_PRICE_GROWTH_USD" },
    { plan: "pro", env: "STRIPE_PRICE_PRO_USD" },
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
