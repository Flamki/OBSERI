// Browser/device parsing adapted from Databuddy; see THIRD_PARTY_NOTICES.md.
import { UAParser } from "ua-parser-js";
import { isCountryCode } from "./country";

export type VisitorContext = {
  country: string | null;
  device: "Desktop" | "Mobile" | "Tablet" | "Unknown";
  browser: string;
};

/** Store coarse metadata only, never the IP address or raw user agent. */
export function visitorContext(request: Request, trustedEdge = false): VisitorContext {
  const candidate = request.headers.get("x-vercel-ip-country")?.toUpperCase() ?? "";
  const country = trustedEdge && isCountryCode(candidate) ? candidate : null;
  const ua = (request.headers.get("user-agent") ?? "").trim().slice(0, 512);
  const result = new UAParser(ua).getResult();
  const device =
    result.device.type === "mobile"
      ? "Mobile"
      : result.device.type === "tablet"
        ? "Tablet"
        : !result.device.type && result.browser.name
          ? "Desktop"
          : "Unknown";
  return { country, device, browser: result.browser.name || "Unknown" };
}
