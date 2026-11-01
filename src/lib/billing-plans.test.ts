import { describe, expect, it } from "vitest";
import {
  BILLING_PLANS,
  SELF_SERVE_PLAN_IDS,
  billingPlanIncludesFeature,
  formatPrice,
  getBillingPlan,
} from "./billing-plans";

describe("billing plan catalog", () => {
  it("keeps self-serve prices and limits finite", () => {
    for (const id of SELF_SERVE_PLAN_IDS) {
      const plan = BILLING_PLANS[id];
      expect(plan.monthlyPriceMinor).toBeTypeOf("number");
      expect(plan.limits.websites).toBeGreaterThan(0);
      expect(plan.limits.textResponsesPerMonth).toBeGreaterThan(0);
      expect(plan.limits.voiceMinutesPerMonth).toBeGreaterThan(0);
    }
  });

  it("falls back to free for an unknown persisted value", () => {
    expect(getBillingPlan("legacy-plan").id).toBe("free");
  });

  it("formats minor units as US dollars", () => {
    expect(formatPrice(3900)).toBe("$39");
    expect(formatPrice(3315)).toBe("$33.15");
  });

  it("uses the USD annual prices (approximately 15 percent savings)", () => {
    for (const id of ["launch", "growth", "scale"] as const) {
      expect(BILLING_PLANS[id].annualPriceMinor).toBe(
        { launch: 39780, growth: 131580, scale: 406980 }[id],
      );
    }
  });

  it("keeps premium feature gates aligned with the catalog", () => {
    expect(billingPlanIncludesFeature("free", "webhooks")).toBe(false);
    expect(billingPlanIncludesFeature("launch", "webhooks")).toBe(true);
    expect(billingPlanIncludesFeature("growth", "webhooks")).toBe(true);
    expect(billingPlanIncludesFeature("growth", "api_access")).toBe(false);
    expect(billingPlanIncludesFeature("scale", "api_access")).toBe(true);
    expect(billingPlanIncludesFeature("enterprise", "remove_branding")).toBe(true);
  });
});
