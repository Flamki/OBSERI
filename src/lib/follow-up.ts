import { z } from "zod";

export const followUpSchema = z.object({
  mode: z.enum(["contact", "booking"]).default("contact"),
  label: z.string().trim().max(60).default(""),
  title: z.string().trim().max(100).default(""),
  description: z.string().trim().max(240).default(""),
  provider: z.enum(["cal", "calendly", "google", "other"]).default("cal"),
  url: z.string().trim().max(2048).default(""),
});
export type FollowUpConfig = z.infer<typeof followUpSchema>;
export const DEFAULT_FOLLOW_UP: FollowUpConfig = followUpSchema.parse({});
export const BOOKING_PROVIDERS = {
  cal: {
    name: "Cal.com",
    placeholder: "https://cal.com/your-name/intro",
    help: "Open your event type in Cal.com and copy its public booking link.",
    docs: "https://cal.com/faq",
  },
  calendly: {
    name: "Calendly",
    placeholder: "https://calendly.com/your-name/intro",
    help: "In Calendly, select your event type and copy its scheduling link.",
    docs: "https://calendly.com/help/how-to-share-your-scheduling-link",
  },
  google: {
    name: "Google Calendar",
    placeholder: "https://calendar.app.google/your-booking-page",
    help: "In Google Calendar, open an appointment schedule, choose Share, then copy the booking-page link.",
    docs: "https://support.google.com/calendar/answer/11608416",
  },
  other: {
    name: "Other booking page",
    placeholder: "https://booking.example.com/intro",
    help: "Paste the public HTTPS page where visitors can choose a time and book with you.",
    docs: "",
  },
};

export function bookingUrl(value: string, provider: FollowUpConfig["provider"]): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !host.includes(".") ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      /^[\d.]+$/.test(host) ||
      host.includes(":")
    )
      return null;
    if (provider === "cal" && !["cal.com", "www.cal.com"].includes(host)) return null;
    if (provider === "calendly" && !["calendly.com", "www.calendly.com"].includes(host))
      return null;
    if (
      provider === "google" &&
      !(
        host === "calendar.app.google" ||
        (host === "calendar.google.com" && /\/appointments\/schedules\/[^/]+/.test(url.pathname))
      )
    )
      return null;
    if (provider !== "other" && url.pathname === "/") return null;
    return url.href;
  } catch {
    return null;
  }
}

type FollowUpPersonality = { leadCapture: boolean; followUp?: FollowUpConfig };
export function followUpError(personality: FollowUpPersonality): string | null {
  if (!personality.leadCapture) return null;
  const parsed = followUpSchema.safeParse(personality.followUp ?? {});
  if (!parsed.success)
    return "Check your follow-up settings. Button text must be 60 characters or fewer, the title 100, and description 240.";
  if (parsed.data.mode === "booking" && !bookingUrl(parsed.data.url, parsed.data.provider))
    return `Add a valid public HTTPS booking link for ${BOOKING_PROVIDERS[parsed.data.provider].name}.`;
  return null;
}
export function resolveFollowUp(personality: FollowUpPersonality): FollowUpConfig | null {
  if (!personality.leadCapture || followUpError(personality)) return null;
  return followUpSchema.parse(personality.followUp ?? {});
}
export function followUpLabel(config: FollowUpConfig) {
  return (
    config.label || (config.mode === "booking" ? "Book a meeting" : "Want a personal follow-up?")
  );
}
