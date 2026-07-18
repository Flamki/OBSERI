import { describe, expect, it } from "vitest";
import { BILLING_PLANS, SELF_SERVE_PLAN_IDS, formatInr, getBillingPlan } from "./billing-plans";

describe("billing plan catalog", () => {
  it("keeps self-serve prices and limits finite", () => {
    for (const id of SELF_SERVE_PLAN_IDS) {
      const plan = BILLING_PLANS[id];
      expect(plan.monthlyPriceInrPaise).toBeTypeOf("number");
      expect(plan.limits.websites).toBeGreaterThan(0);
      expect(plan.limits.textResponsesPerMonth).toBeGreaterThan(0);
      expect(plan.limits.voiceMinutesPerMonth).toBeGreaterThan(0);
    }
  });

  it("falls back to free for an unknown persisted value", () => {
    expect(getBillingPlan("legacy-plan").id).toBe("free");
  });

  it("formats paise as Indian rupees", () => {
    expect(formatInr(349_900)).toContain("3,499");
  });
});
