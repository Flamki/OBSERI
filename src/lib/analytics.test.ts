import { describe, expect, it } from "vitest";
import {
  cleanAnalyticsPath,
  cleanCampaign,
  cleanReferrer,
  contactRequestSchema,
  conversionRate,
  trackingSchema,
} from "./analytics";

describe("conversion tracking boundaries", () => {
  it("removes queries, fragments, email addresses and opaque IDs from paths", () => {
    expect(cleanAnalyticsPath("https://example.com/pricing?email=a@b.com#secret")).toBe("/pricing");
    expect(cleanAnalyticsPath("/people/sam%40example.com/orders/123456789")).toBe(
      "/people/:redacted/orders/:redacted",
    );
    expect(cleanAnalyticsPath("javascript:alert(1)")).toBe("/");
    expect(cleanReferrer("https://user:pass@example.com/search?q=private")).toBe("example.com");
    expect(cleanCampaign("sam@example.com")).toBe("");
    expect(cleanCampaign("spring-launch")).toBe("spring-launch");
  });
  it("requires a valid contact and explicit permission", () => {
    const request = {
      id: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
      name: "Sam",
      email: "sam@example.com",
      message: "Please send details",
      consent: true,
    };
    expect(contactRequestSchema.safeParse(request).success).toBe(true);
    expect(contactRequestSchema.safeParse({ ...request, consent: false }).success).toBe(false);
    expect(contactRequestSchema.safeParse({ ...request, email: "wrong" }).success).toBe(false);
    expect(contactRequestSchema.safeParse({ ...request, message: " " }).success).toBe(false);
  });
  it("rejects forged outcome events and oversized batches", () => {
    const event = { id: crypto.randomUUID(), name: "page_view" };
    expect(
      trackingSchema.safeParse({ sessionId: crypto.randomUUID(), events: [event] }).success,
    ).toBe(true);
    expect(
      trackingSchema.safeParse({
        sessionId: crypto.randomUUID(),
        events: [{ ...event, name: "purchase" }],
      }).success,
    ).toBe(false);
    expect(
      trackingSchema.safeParse({ sessionId: crypto.randomUUID(), events: Array(21).fill(event) })
        .success,
    ).toBe(false);
    expect(conversionRate(0, 0)).toBe("—");
  });
});
