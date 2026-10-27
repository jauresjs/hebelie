export type BillingPlan = "starter" | "growth" | "pro";

export const PLAN_QUOTA: Record<BillingPlan, number> = {
  starter: 100,
  growth: 200,
  pro: 300,
};

export function planFromPriceId(priceId: string): BillingPlan | null {
  const starter = Deno.env.get("STRIPE_PRICE_STARTER");
  const growth = Deno.env.get("STRIPE_PRICE_GROWTH");
  const pro = Deno.env.get("STRIPE_PRICE_PRO");
  if (priceId === starter) return "starter";
  if (priceId === growth) return "growth";
  if (priceId === pro) return "pro";
  return null;
}

export function priceIdForPlan(plan: string): string | null {
  const p = plan as BillingPlan;
  if (p === "starter") return Deno.env.get("STRIPE_PRICE_STARTER") ?? null;
  if (p === "growth") return Deno.env.get("STRIPE_PRICE_GROWTH") ?? null;
  if (p === "pro") return Deno.env.get("STRIPE_PRICE_PRO") ?? null;
  return null;
}

export function lookupKeyForPlan(plan: BillingPlan): string {
  return `hebelie_${plan}_monthly_cad`;
}

/** Env price ID first, then Stripe price lookup_key. */
export async function resolvePriceId(
  stripe: { prices: { list: (p: Record<string, unknown>) => Promise<{ data: { id: string }[] }> } },
  plan: string,
): Promise<string | null> {
  const fromEnv = priceIdForPlan(plan);
  if (fromEnv) return fromEnv;
  const p = plan as BillingPlan;
  if (!PLAN_QUOTA[p]) return null;
  const listed = await stripe.prices.list({
    lookup_keys: [lookupKeyForPlan(p)],
    active: true,
    limit: 1,
  });
  return listed.data[0]?.id ?? null;
}

export function quotaForPlan(plan: BillingPlan | null): number {
  if (!plan) return 0;
  return PLAN_QUOTA[plan] ?? 0;
}
