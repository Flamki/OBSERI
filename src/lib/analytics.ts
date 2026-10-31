import { z } from "zod";

export const eventNames = [
  "page_view",
  "widget_opened",
  "conversation_started",
  "help_shown",
  "help_clicked",
] as const;
export const analyticsEventSchema = z.object({
  id: z.string().uuid(),
  name: z.enum(eventNames),
  path: z.string().max(500).default("/"),
  referrer: z.string().max(250).default(""),
  source: z.string().max(100).default(""),
  campaign: z.string().max(100).default(""),
});
export const trackingSchema = z.object({
  sessionId: z.string().uuid(),
  events: z.array(analyticsEventSchema).min(1).max(20),
});
export const contactRequestSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(1).max(2000),
  consent: z.literal(true),
  path: z.string().max(500).default("/"),
});

export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type ContactRequest = z.infer<typeof contactRequestSchema>;
export type CapturedLead = ContactRequest & {
  createdAt: string;
  status: "new" | "qualified" | "won" | "closed";
};
export type JourneyEvent = { name: string; path: string; createdAt: string };
export type AnalyticsReport = {
  days: number;
  totals: {
    sessions: number;
    pageViews: number;
    engaged: number;
    assisted: number;
    contacts: number;
    qualified: number;
    won: number;
  };
  sources: Array<{ source: string; sessions: number; contacts: number }>;
  pages: Array<{ path: string; views: number }>;
  daily: Array<{ date: string; sessions: number; views: number }>;
  countries: Array<{ country: string | null; sessions: number; contacts: number }>;
  devices: Array<{ name: string; sessions: number }>;
  browsers: Array<{ name: string; sessions: number }>;
  journeys: Array<{
    sessionId: string;
    source: string;
    country: string | null;
    device: string;
    browser: string;
    startedAt: string;
    events: JourneyEvent[];
  }>;
  leads: CapturedLead[];
};

// Keep arbitrary URL queries, fragments, credentials and contact details out of analytics.
export function cleanAnalyticsPath(value: string): string {
  try {
    const url = new URL(value, "https://analytics.invalid");
    if (!/^https?:$/.test(url.protocol)) return "/";
    return (
      url.pathname
        .split("/")
        .map((segment) => {
          let decoded = segment;
          try {
            decoded = decodeURIComponent(segment);
          } catch {
            /* Keep malformed segments opaque. */
          }
          return /@|\d{6,}|[a-f0-9]{24,}/i.test(decoded) ? ":redacted" : segment;
        })
        .join("/")
        .slice(0, 500) || "/"
    );
  } catch {
    return "/";
  }
}

export function cleanCampaign(value: string): string {
  return /^[a-z0-9 _.-]{0,100}$/i.test(value) ? value : "";
}

export function cleanReferrer(value: string): string {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.hostname : "";
  } catch {
    return "";
  }
}

export function conversionRate(count: number, total: number): string {
  return total > 0 ? `${((count / total) * 100).toFixed(1)}%` : "—";
}
