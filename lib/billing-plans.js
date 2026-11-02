/** One-time previews for new clinics (no subscription). Keep in sync with supabase _shared/billing.ts */
export const FREE_TRIAL_PREVIEWS = 10;

/** Matches clinics.billing_plan for new signups (no Stripe). */
export const FREE_TRIAL_PLAN_ID = "free_trial";

export const FREE_TIER_PLAN = {
  id: FREE_TRIAL_PLAN_ID,
  name: "Free",
  monthlyAmount: 0,
  previews: FREE_TRIAL_PREVIEWS,
  description: "Try the embed on your site—no credit card.",
  free: true,
};

/** Public plan catalog — same numeric amounts in CAD (Canada), EUR (Europe), or USD (elsewhere). */
export const BILLING_PLANS = [
  {
    id: "starter",
    name: "Starter",
    monthlyAmount: 99,
    previews: 100,
    description: "For a single location testing embed leads.",
  },
  {
    id: "growth",
    name: "Growth",
    monthlyAmount: 180,
    previews: 200,
    description: "Best for active medspas with steady website traffic.",
    recommended: true,
  },
  {
    id: "pro",
    name: "Pro",
    monthlyAmount: 250,
    previews: 300,
    description: "Higher volume or multi-provider clinics.",
  },
];

/** Home, pricing page, and dashboard billing picker (free + paid). */
export const PUBLIC_BILLING_PLANS = [FREE_TIER_PLAN, ...BILLING_PLANS];

export function isPaidPlanId(id) {
  return BILLING_PLANS.some((p) => p.id === id);
}

export function planById(id) {
  if (id === FREE_TRIAL_PLAN_ID) return FREE_TIER_PLAN;
  return BILLING_PLANS.find((p) => p.id === id) ?? null;
}

export function priceIdForPlan(planId, config) {
  const prices = config?.stripePrices ?? {};
  return prices[planId] ?? null;
}
