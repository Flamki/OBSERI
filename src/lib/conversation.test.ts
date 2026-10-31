import { afterEach, expect, it, vi } from "vitest";
import { answerSoulQuestion } from "./conversation";
import { createSoul } from "./soul";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("uses low reasoning for GPT OSS and returns the grounded model answer", async () => {
  vi.stubEnv("OBSERI_CHAT_API_URL", "https://api.fireworks.ai/inference/v1");
  vi.stubEnv("OBSERI_CHAT_MODEL", "accounts/fireworks/models/gpt-oss-20b");
  const soul = createSoul("https://merchant.example");
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: "We build websites.",
              citationIds: ["chunk"],
              followUp: "What would you like to build?",
              leadIntent: "medium",
            }),
          },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const result = await answerSoulQuestion({
    soulId: soul.id,
    personality: soul.personality,
    chunks: [
      {
        id: "chunk",
        pageTitle: "Services",
        pageUrl: "https://merchant.example",
        text: "We build websites for businesses.",
        order: 0,
        tokenEstimate: 8,
      },
    ],
    messages: [{ role: "visitor", content: "Do you build websites?" }],
  });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).reasoning_effort).toBe("low");
  expect(result.mode).toBe("model");
  expect(result.answer).toBe("We build websites.");
  expect(result.citations[0].chunkId).toBe("chunk");
});
