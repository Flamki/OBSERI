import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  billingPlanFromRazorpayPlanId,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhook,
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
});
