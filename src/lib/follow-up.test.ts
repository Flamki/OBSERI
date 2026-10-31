import { describe, expect, it } from "vitest";
import {
  bookingUrl,
  DEFAULT_FOLLOW_UP,
  followUpError,
  followUpLabel,
  resolveFollowUp,
} from "./follow-up";
import { createSoul } from "./soul";
import { publishSoul } from "./integration-store";

describe("follow-up configuration", () => {
  it("preserves existing contact forms and honours the disable switch", () => {
    expect(resolveFollowUp({ leadCapture: true })).toEqual(DEFAULT_FOLLOW_UP);
    expect(resolveFollowUp({ leadCapture: false })).toBeNull();
    expect(followUpLabel({ ...DEFAULT_FOLLOW_UP, mode: "booking" })).toBe("Book a meeting");
  });
  it("supports public Cal, Calendly, Google and custom booking links", () => {
    for (const [provider, url] of [
      ["cal", "https://cal.com/ayush/intro"],
      ["calendly", "https://calendly.com/ayush/intro"],
      ["google", "https://calendar.app.google/abc123"],
      ["google", "https://calendar.google.com/calendar/u/0/appointments/schedules/abc123"],
      ["other", "https://book.example.com/intro"],
    ] as const)
      expect(bookingUrl(url, provider)).toBe(url);
  });
  it("rejects scripts, private hosts, provider lookalikes and non-booking Google links", () => {
    for (const url of [
      "javascript:alert(1)",
      "http://cal.com/name",
      "https://cal.com.evil.example/name",
      "https://user:password@cal.com/name",
      "https://cal.com/",
      "https://cal.com:8443/name",
    ])
      expect(bookingUrl(url, "cal")).toBeNull();
    for (const url of [
      "https://localhost/",
      "https://127.0.0.1/",
      "https://[::1]/",
      "//book.example.com/intro",
    ])
      expect(bookingUrl(url, "other")).toBeNull();
    expect(bookingUrl("https://calendar.google.com/calendar/u/0/r", "google")).toBeNull();
    expect(
      resolveFollowUp({
        leadCapture: true,
        followUp: { ...DEFAULT_FOLLOW_UP, mode: "booking", url: "javascript:alert(1)" },
      }),
    ).toBeNull();
  });
  it("allows incomplete disabled drafts but blocks invalid published booking settings", async () => {
    const soul = createSoul("https://merchant.example");
    soul.personality.followUp = { ...DEFAULT_FOLLOW_UP, mode: "booking", url: "" };
    expect(followUpError(soul.personality)).toContain("valid public HTTPS");
    await expect(
      publishSoul({
        value: soul,
        ownerKey: soul.channels.publishKey,
        widgetToken: soul.channels.widgetToken,
        ownerUserId: "test",
      }),
    ).rejects.toMatchObject({ status: 422, code: "invalid_follow_up" });
    expect(followUpError({ ...soul.personality, leadCapture: false })).toBeNull();
    expect(
      followUpError({
        leadCapture: true,
        followUp: { ...DEFAULT_FOLLOW_UP, label: "a".repeat(61) },
      }),
    ).toContain("60 characters");
  });
});
