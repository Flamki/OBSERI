import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createWidgetSession,
  normalizeAllowedDomains,
  originAllowed,
  verifyWidgetSession,
} from "@/lib/integration-security";

describe("integration security", () => {
  const originalSecret = process.env.OBSERI_WIDGET_SESSION_SECRET;

  beforeEach(() => {
    process.env.OBSERI_WIDGET_SESSION_SECRET =
      "test-session-secret-that-is-longer-than-thirty-two-bytes";
  });

  afterEach(() => {
    if (originalSecret) process.env.OBSERI_WIDGET_SESSION_SECRET = originalSecret;
    else delete process.env.OBSERI_WIDGET_SESSION_SECRET;
  });

  it("normalizes exact and wildcard domains and rejects malformed values", () => {
    expect(
      normalizeAllowedDomains([
        "https://WWW.Example.com/path",
        "*.docs.example.com",
        "javascript:alert(1)",
        "localhost",
      ]),
    ).toEqual(["www.example.com", "*.docs.example.com"]);
  });

  it("matches exact domains without allowing lookalikes", () => {
    expect(originAllowed("https://www.example.com", ["example.com"])).toBe(true);
    expect(originAllowed("https://example.com.attacker.test", ["example.com"])).toBe(false);
  });

  it("matches wildcard subdomains but not the apex", () => {
    expect(originAllowed("https://help.docs.example.com", ["*.example.com"])).toBe(true);
    expect(originAllowed("https://example.com", ["*.example.com"])).toBe(false);
  });

  it("creates an origin-bound, soul-bound session and rejects tampering", () => {
    const token = createWidgetSession("soul_123", "https://example.com");
    expect(verifyWidgetSession(token, "soul_123").origin).toBe("https://example.com");
    expect(() => verifyWidgetSession(token, "another_soul")).toThrow();
    expect(() => verifyWidgetSession(`${token}x`, "soul_123")).toThrow();
  });

  it("fails closed when the session secret is missing", () => {
    delete process.env.OBSERI_WIDGET_SESSION_SECRET;
    expect(() => createWidgetSession("soul_123", "https://example.com")).toThrow(/not configured/i);
  });
});
