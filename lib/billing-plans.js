/** Public plan catalog (CAD). Price IDs come from config.js / Supabase secrets. */
export const BILLING_PLANS = [
  {
    id: "starter",
    name: "Starter",
    priceCad: 99,
    previews: 100,
    description: "For a single location testing embed leads.",
  },
  {
    id: "growth",
    name: "Growth",
    priceCad: 180,
    previews: 200,
    description: "Best for active medspas with steady website traffic.",
    recommended: true,
  },
  {
    id: "pro",
    name: "Pro",
    priceCad: 250,
    previews: 300,
    description: "Higher volume or multi-provider clinics.",
  },
];

export function planById(id) {
  return BILLING_PLANS.find((p) => p.id === id) ?? null;
}

export function priceIdForPlan(planId, config) {
  const prices = config?.stripePrices ?? {};
  return prices[planId] ?? null;
}
