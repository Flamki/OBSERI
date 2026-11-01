import prices from "./billing-prices.json" with { type: "json" };

export const BILLING_CURRENCY = prices.currency;

export type BillingPlanId = "free" | "launch" | "growth" | "scale" | "enterprise";
export type BillingFeature = "webhooks" | "remove_branding" | "api_access";

export type BillingLimits = {
  websites: number | null;
  indexedPages: number | null;
  textResponsesPerMonth: number | null;
  voiceMinutesPerMonth: number | null;
  seats: number | null;
  retentionDays: number | null;
  refreshIntervalHours: number | null;
};

export type BillingPlan = {
  id: BillingPlanId;
  name: string;
  description: string;
  monthlyPriceMinor: number | null;
  annualPriceMinor: number | null;
  limits: BillingLimits;
  features: readonly string[];
  highlighted?: boolean;
  contactSales?: boolean;
};

/**
 * Provider IDs and credentials are intentionally absent from this public
 * catalog. They belong in server-only environment variables.
 */
export const BILLING_PLANS = {
  free: {
    id: "free",
    name: "Free",
    description: "Find your first website conversations.",
    monthlyPriceMinor: 0,
    annualPriceMinor: 0,
    limits: {
      websites: 1,
      indexedPages: 30,
      textResponsesPerMonth: 100,
      voiceMinutesPerMonth: 5,
      seats: 1,
      retentionDays: 7,
      refreshIntervalHours: null,
    },
    features: [
      "Voice and chat assistant",
      "Visitor analytics and journeys",
      "Contact capture and conversion funnel",
      "Community support",
    ],
  },
  launch: {
    id: "launch",
    name: "Launch",
    description: "Turn website interest into contact requests.",
    monthlyPriceMinor: prices.launch.monthly,
    annualPriceMinor: prices.launch.annual,
    limits: {
      websites: 1,
      indexedPages: 300,
      textResponsesPerMonth: 1_000,
      voiceMinutesPerMonth: 30,
      seats: 1,
      retentionDays: 30,
      refreshIntervalHours: null,
    },
    features: [
      "Everything in Free",
      "Signed lead webhooks",
      "Contact outcomes and CSV export",
      "Email support",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    description: "For teams turning website traffic into pipeline.",
    monthlyPriceMinor: prices.growth.monthly,
    annualPriceMinor: prices.growth.annual,
    limits: {
      websites: 3,
      indexedPages: 2_000,
      textResponsesPerMonth: 5_000,
      voiceMinutesPerMonth: 120,
      seats: 5,
      retentionDays: 90,
      refreshIntervalHours: null,
    },
    features: [
      "Manual incremental refresh",
      "Signed webhooks and integrations",
      "Conversation analytics",
      "90-day conversation history",
      "Priority email support",
    ],
    highlighted: true,
  },
  scale: {
    id: "scale",
    name: "Scale",
    description: "For high-volume teams with multiple websites.",
    monthlyPriceMinor: prices.scale.monthly,
    annualPriceMinor: prices.scale.annual,
    limits: {
      websites: 10,
      indexedPages: 10_000,
      textResponsesPerMonth: 20_000,
      voiceMinutesPerMonth: 300,
      seats: 15,
      retentionDays: 365,
      refreshIntervalHours: null,
    },
    features: [
      "Manual incremental refresh",
      "Signed webhooks and integrations",
      "365-day conversation history",
      "High-volume workspace capacity",
      "Priority support",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    description: "Discuss capacity, team workflows, and setup needs.",
    monthlyPriceMinor: null,
    annualPriceMinor: null,
    limits: {
      websites: null,
      indexedPages: null,
      textResponsesPerMonth: null,
      voiceMinutesPerMonth: null,
      seats: null,
      retentionDays: null,
      refreshIntervalHours: null,
    },
    features: [
      "Discuss usage and capacity",
      "Multiple website workflows",
      "Team permissions and activity log",
      "Neural website voice",
      "Setup assistance",
    ],
    contactSales: true,
  },
} as const satisfies Record<BillingPlanId, BillingPlan>;

export const SELF_SERVE_PLAN_IDS = ["free", "launch", "growth", "scale"] as const;

export const BILLING_FEATURE_MINIMUM: Record<BillingFeature, BillingPlanId> = {
  webhooks: "launch",
  remove_branding: "growth",
  api_access: "scale",
};

const BILLING_PLAN_RANK: Record<BillingPlanId, number> = {
  free: 0,
  launch: 1,
  growth: 2,
  scale: 3,
  enterprise: 4,
};

export function billingPlanIncludesFeature(
  planId: BillingPlanId,
  feature: BillingFeature,
): boolean {
  return BILLING_PLAN_RANK[planId] >= BILLING_PLAN_RANK[BILLING_FEATURE_MINIMUM[feature]];
}

export function isBillingPlanId(value: unknown): value is BillingPlanId {
  return typeof value === "string" && value in BILLING_PLANS;
}

export function getBillingPlan(value: unknown): BillingPlan {
  return isBillingPlanId(value) ? BILLING_PLANS[value] : BILLING_PLANS.free;
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: BILLING_CURRENCY,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
