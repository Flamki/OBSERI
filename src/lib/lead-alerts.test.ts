import { afterEach, describe, expect, it, vi } from "vitest";
import type { SoulConversation } from "@/lib/soul";
import { buildLeadAlertEmail, isEmailAddress, sendLeadAlert } from "@/lib/lead-alerts";

const conversation: SoulConversation = {
  id: "c1",
  startedAt: "2026-09-24T10:00:00.000Z",
  updatedAt: "2026-09-24T10:02:00.000Z",
  channel: "widget",
  visitorLabel: "Website visitor",
  leadIntent: "high",
  messages: [
    { id: "1", role: "visitor", content: "Do you ship <b>to</b> Canada?", createdAt: "" },
    { id: "2", role: "assistant", content: "Yes, in 5–7 days.", createdAt: "" },
    { id: "3", role: "visitor", content: "Great, I'm sam@example.com", createdAt: "" },
  ],
};

describe("buildLeadAlertEmail", () => {
  it("names the lead, the site and the intent in the subject", () => {
    const email = buildLeadAlertEmail({
      siteUrl: "https://www.northwind.store",
      agentName: "Ona",
      conversation,
    });
    expect(email.subject).toBe("Hot lead on northwind.store: sam@example.com");
    expect(email.text).toContain("Email: sam@example.com");
    expect(email.text).toContain("Ona: Yes, in 5–7 days.");
  });

  it("escapes visitor-written HTML", () => {
    const email = buildLeadAlertEmail({
      siteUrl: "https://northwind.store",
      agentName: "Ona",
      conversation,
    });
    expect(email.html).not.toContain("<b>to</b>");
    expect(email.html).toContain("&lt;b&gt;to&lt;/b&gt;");
  });

  it("keeps the subject on one line", () => {
    const email = buildLeadAlertEmail({
      siteUrl: "https://northwind.store",
      agentName: "Ona",
      conversation: {
        ...conversation,
        messages: [{ id: "1", role: "visitor", content: "reach me\r\nBcc: x@y.co", createdAt: "" }],
      },
    });
    expect(email.subject).not.toMatch(/[\r\n]/);
  });
});

describe("isEmailAddress", () => {
  it("accepts ordinary addresses and rejects header tricks", () => {
    expect(isEmailAddress("founder@example.com")).toBe(true);
    expect(isEmailAddress("not an email")).toBe(false);
    expect(isEmailAddress("a@b.co\nBcc: c@d.co")).toBe(false);
    expect(isEmailAddress("")).toBe(false);
  });
});

describe("sendLeadAlert", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does nothing without a provider key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendLeadAlert("a@b.co", { subject: "s", html: "h", text: "t" })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to Resend when configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendLeadAlert("a@b.co", { subject: "s", html: "h", text: "t" })).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(init.body).to).toEqual(["a@b.co"]);
  });
});
