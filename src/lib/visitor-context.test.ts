import { describe, expect, it } from "vitest";
import { visitorContext } from "./visitor-context";
import { countryName, isCountryCode } from "./country";
const chrome =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
describe("coarse visitor metadata", () => {
  it("accepts country only from trusted deployment headers and never includes raw metadata", () => {
    const req = new Request("https://obseri.com", {
      headers: {
        "x-vercel-ip-country": "IN",
        "user-agent": chrome,
        "x-forwarded-for": "203.0.113.1",
      },
    });
    expect(visitorContext(req)).toEqual({ country: null, device: "Desktop", browser: "Chrome" });
    expect(visitorContext(req, true)).toEqual({
      country: "IN",
      device: "Desktop",
      browser: "Chrome",
    });
  });
  it("handles unavailable geography and unknown browsers", () => {
    expect(
      visitorContext(
        new Request("https://obseri.com", { headers: { "x-vercel-ip-country": "XX" } }),
        true,
      ),
    ).toEqual({ country: null, device: "Unknown", browser: "Unknown" });
    expect(countryName(null)).toBe("Unknown");
    expect(countryName("IN")).toBe("India");
    expect(isCountryCode("EU")).toBe(false);
    expect(isCountryCode("ZZ")).toBe(false);
  });
  it("recognises mobile Safari and Android tablets through Databuddy's parser", () => {
    const parse = (ua: string) =>
      visitorContext(new Request("https://obseri.com", { headers: { "user-agent": ua } }));
    expect(
      parse(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toMatchObject({ device: "Mobile", browser: "Mobile Safari" });
    expect(
      parse(
        "Mozilla/5.0 (Linux; Android 12; SM-T870) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      ),
    ).toMatchObject({ device: "Tablet", browser: "Chrome" });
  });
});
