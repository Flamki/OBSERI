import { describe, expect, it } from "vitest";
import type { SoulConversation } from "@/lib/soul";
import {
  countSince,
  extractContact,
  firstQuestion,
  isLead,
  leadsToCsv,
  relativeTime,
  topQuestions,
} from "@/lib/conversation-insights";

function conversation(
  visitor: string[],
  leadIntent: SoulConversation["leadIntent"] = "none",
  updatedAt = "2026-09-20T10:00:00.000Z",
): SoulConversation {
  return {
    id: crypto.randomUUID(),
    startedAt: updatedAt,
    updatedAt,
    channel: "widget",
    visitorLabel: "Website visitor",
    leadIntent,
    messages: visitor.flatMap((content, index) => [
      { id: `v${index}`, role: "visitor" as const, content, createdAt: updatedAt },
      { id: `a${index}`, role: "assistant" as const, content: "Sure.", createdAt: updatedAt },
    ]),
  };
}

describe("extractContact", () => {
  it("finds an email and phone number the visitor typed", () => {
    const contact = extractContact(
      conversation(["Hi", "Reach me at Sam@Example.com or +91 98765 43210"]),
    );
    expect(contact.email).toBe("sam@example.com");
    expect(contact.phone).toBe("+91 98765 43210");
  });

  it("ignores contact details written by the assistant", () => {
    const value = conversation(["Hello"]);
    value.messages[1].content = "Email us at team@obseri.com";
    expect(extractContact(value)).toEqual({});
  });

  it("does not treat prices or dates as phone numbers", () => {
    expect(extractContact(conversation(["Is it $80 for 2 items?"])).phone).toBeUndefined();
    expect(extractContact(conversation(["Can I book for 2026-09-20?"])).phone).toBeUndefined();
    expect(extractContact(conversation(["Delivered 20/09/2026?"])).phone).toBeUndefined();
  });
});

describe("isLead", () => {
  it("counts medium and high intent as leads", () => {
    expect(isLead(conversation(["Pricing?"], "high"))).toBe(true);
    expect(isLead(conversation(["Pricing?"], "medium"))).toBe(true);
    expect(isLead(conversation(["Pricing?"], "low"))).toBe(false);
  });

  it("counts any conversation with contact details as a lead", () => {
    expect(isLead(conversation(["ping me: a@b.co"], "none"))).toBe(true);
  });
});

describe("topQuestions", () => {
  it("groups the same opening question regardless of case and punctuation", () => {
    const result = topQuestions([
      conversation(["Do you ship to Canada?"]),
      conversation(["do you ship to canada"]),
      conversation(["What is your refund policy?"]),
    ]);
    expect(result[0]).toEqual({ question: "Do you ship to Canada?", count: 2 });
    expect(result).toHaveLength(2);
  });
});

describe("countSince and relativeTime", () => {
  const now = Date.parse("2026-09-24T10:00:00.000Z");

  it("counts conversations inside the window", () => {
    expect(
      countSince(
        [
          conversation(["a"], "none", "2026-09-23T10:00:00.000Z"),
          conversation(["b"], "none", "2026-09-01T10:00:00.000Z"),
        ],
        7,
        now,
      ),
    ).toBe(1);
  });

  it("formats recent times compactly", () => {
    expect(relativeTime("2026-09-24T09:59:30.000Z", now)).toBe("just now");
    expect(relativeTime("2026-09-24T09:15:00.000Z", now)).toBe("45m ago");
    expect(relativeTime("2026-09-24T07:00:00.000Z", now)).toBe("3h ago");
    expect(relativeTime("2026-09-22T10:00:00.000Z", now)).toBe("2d ago");
    expect(relativeTime("not a date", now)).toBe("");
  });
});

describe("leadsToCsv", () => {
  it("exports only leads and neutralises spreadsheet formulas", () => {
    const csv = leadsToCsv([
      conversation(["=HYPERLINK('x') me@x.io"], "high"),
      conversation(["just browsing"], "none"),
    ]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('"First question"');
    expect(lines[1]).toContain('"me@x.io"');
    expect(lines[1]).toContain(`"'=HYPERLINK('x') me@x.io"`);
  });

  it("returns the opening question", () => {
    expect(firstQuestion(conversation(["  Hello there  "]))).toBe("Hello there");
  });
});
