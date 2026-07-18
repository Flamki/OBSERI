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
  monthlyPriceInrPaise: number | null;
  annualPriceInrPaise: number | null;
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
    description: "Build and test one website soul.",
    monthlyPriceInrPaise: 0,
    annualPriceInrPaise: 0,
    limits: {
      websites: 1,
      indexedPages: 30,
      textResponsesPerMonth: 100,
      voiceMinutesPerMonth: 5,
      seats: 1,
      retentionDays: 7,
      refreshIntervalHours: null,
    },
    features: ["Website voice and chat widget", "Manual website refresh", "Community support"],
  },
  launch: {
    id: "launch",
    name: "Launch",
    description: "For a live website starting real conversations.",
    monthlyPriceInrPaise: 349_900,
    annualPriceInrPaise: 3_569_000,
    limits: {
      websites: 1,
      indexedPages: 300,
      textResponsesPerMonth: 1_000,
      voiceMinutesPerMonth: 30,
      seats: 1,
      retentionDays: 30,
      refreshIntervalHours: null,
    },
    features: ["Manual incremental refresh", "Lead capture", "Email support"],
  },
  growth: {
    id: "growth",
    name: "Growth",
    description: "For teams turning website traffic into pipeline.",
    monthlyPriceInrPaise: 1_099_900,
    annualPriceInrPaise: 11_219_000,
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
    monthlyPriceInrPaise: 3_499_900,
    annualPriceInrPaise: 35_699_000,
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
    description: "Custom capacity, security, and deployment controls.",
    monthlyPriceInrPaise: null,
    annualPriceInrPaise: null,
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
      "Committed usage pricing",
      "Custom retention and regions",
      "SSO and audit controls",
      "Private voice or model deployment",
      "SLA and dedicated support",
    ],
    contactSales: true,
  },
} as const satisfies Record<BillingPlanId, BillingPlan>;

export const SELF_SERVE_PLAN_IDS = ["free", "launch", "growth", "scale"] as const;

export const BILLING_FEATURE_MINIMUM: Record<BillingFeature, BillingPlanId> = {
  webhooks: "growth",
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

export function formatInr(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}
