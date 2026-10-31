import { describe, expect, it } from "vitest";
import { findSpeechBoundary } from "./speech-segments";

describe("streamed speech phrasing", () => {
  it("keeps a sentence intact across token arrivals instead of chopping at 70 characters", () => {
    const sentence =
      "I build websites and AI applications that help your business answer questions and connect with customers.";
    for (let length = 1; length <= sentence.length; length++) {
      expect(findSpeechBoundary(sentence.slice(0, length))).toBe(-1);
    }
    expect(findSpeechBoundary(sentence + " Tell me more.")).toBe(sentence.length + 1);
  });

  it("does not split decimal prices or a title before someone's name", () => {
    const sentence = "You can speak with Dr. Smith about the $19.99 monthly plan.";
    expect(findSpeechBoundary(sentence + " It includes support.")).toBe(sentence.length + 1);
  });

  it("handles quoted endings and scripts without spaces", () => {
    const quoted = 'The assistant will say, "How can I help?" ';
    expect(findSpeechBoundary(quoted + "Then listen.")).toBe(quoted.length);
    const sentence = "私たちのウェブサイトをご覧いただきありがとうございます。";
    expect(findSpeechBoundary(sentence + "質問はありますか？")).toBe(sentence.length);
  });

  it("bounds long unfinished speech at a clause or word boundary", () => {
    const clause = "A useful detail ".repeat(8) + ", ";
    expect(findSpeechBoundary(clause + "more details ".repeat(15))).toBe(clause.length);
    const long = "long sentence ".repeat(30);
    const split = findSpeechBoundary(long);
    expect(split).toBeGreaterThan(100);
    expect(split).toBeLessThanOrEqual(321);
    expect(long[split - 1]).toBe(" ");
  });
});
