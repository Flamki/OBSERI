import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  billingPlanFromRazorpayPlanId,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhook,
  createRazorpaySubscription,
  razorpayPlanId,
} from "./razorpay";

const originalEnvironment = { ...process.env };

describe("Razorpay verification", () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_obseri";
    process.env.RAZORPAY_KEY_SECRET = "checkout-secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook-secret";
    process.env.RAZORPAY_PLAN_GROWTH_MONTHLY = "plan_growth_monthly";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnvironment };
  });

  it("accepts only the exact checkout signature", () => {
    const paymentId = "pay_12345678901234";
    const subscriptionId = "sub_12345678901234";
    const signature = createHmac("sha256", "checkout-secret")
      .update(`${paymentId}|${subscriptionId}`)
      .digest("hex");

    expect(verifyRazorpayCheckoutSignature({ paymentId, subscriptionId, signature })).toBe(true);
    expect(
      verifyRazorpayCheckoutSignature({
        paymentId,
        subscriptionId,
        signature: "0".repeat(64),
      }),
    ).toBe(false);
  });

  it("accepts only the exact raw-body webhook signature", () => {
    const body = JSON.stringify({ event: "subscription.activated" });
    const signature = createHmac("sha256", "webhook-secret").update(body).digest("hex");
    expect(verifyRazorpayWebhook(body, signature)).toBe(true);
    expect(verifyRazorpayWebhook(`${body} `, signature)).toBe(false);
  });

  it("maps provider plan ids without trusting webhook notes", () => {
    expect(billingPlanFromRazorpayPlanId("plan_growth_monthly")).toEqual({
      planId: "growth",
      cycle: "monthly",
    });
    expect(billingPlanFromRazorpayPlanId("plan_unknown")).toBeNull();
  });

  it("uses the existing INR plan even if a future USD plan is configured", () => {
    process.env.RAZORPAY_PLAN_GROWTH_MONTHLY_USD = "plan_future_usd";
    expect(razorpayPlanId("growth", "monthly")).toBe("plan_growth_monthly");
  });

  it("rejects a mismatched currency or amount before creating a subscription", async () => {
    process.env.RAZORPAY_PLAN_GROWTH_MONTHLY = "plan_growth_monthly";
    for (const item of [
      { currency: "INR", amount: 12900 },
      { currency: "USD", amount: 1099900 },
    ]) {
      const fetch = vi
        .fn()
        .mockResolvedValue(Response.json({ period: "monthly", interval: 1, item }));
      vi.stubGlobal("fetch", fetch);
      await expect(
        createRazorpaySubscription({ planId: "growth", cycle: "monthly", ownerUserId: "owner" }),
      ).rejects.toThrow("does not match");
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("creates checkout only after validating the advertised INR plan", async () => {
    process.env.RAZORPAY_PLAN_GROWTH_MONTHLY = "plan_growth_monthly";
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          period: "monthly",
          interval: 1,
          item: { currency: "INR", amount: 1099900 },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ id: "sub_new", plan_id: "plan_growth_monthly", status: "created" }),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await createRazorpaySubscription({
      planId: "growth",
      cycle: "monthly",
      ownerUserId: "owner",
    });
    expect(result.providerPlanId).toBe("plan_growth_monthly");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
