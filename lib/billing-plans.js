/** Public plan catalog — same dollar amounts in CAD (Canada) or USD (elsewhere). */
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

export function planById(id) {
  return BILLING_PLANS.find((p) => p.id === id) ?? null;
}

export function priceIdForPlan(planId, config) {
  const prices = config?.stripePrices ?? {};
  return prices[planId] ?? null;
}
